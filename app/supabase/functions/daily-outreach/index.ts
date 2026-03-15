import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('NOVA_CORE_SUPABASE_URL')!,
    Deno.env.get('NOVA_CORE_SERVICE_ROLE_KEY')!
  )
  const vercelUrl = Deno.env.get('VERCEL_URL') || 'https://app-nova-42373ca7.vercel.app'
  const postmarkToken = Deno.env.get('POSTMARK_SERVER_TOKEN')!

  // Get active orgs (paying or in trial)
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .or('is_paying.eq.true,and(trial_ends_at.not.is.null,trial_ends_at.gt.now())')
    .limit(10)

  let totalSent = 0

  for (const org of orgs ?? []) {
    // Check daily cap
    const { count: todayCount } = await supabase
      .from('sub_outreach_log')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .gte('sent_at', new Date(Date.now() - 86400000).toISOString())

    if ((todayCount ?? 0) >= 50) continue

    // Get eligible subs (last submission > 30 days ago)
    const { data: subs } = await supabase.rpc('get_reactivation_candidates', {
      p_org_id: org.id
    })

    for (const sub of subs ?? []) {
      if (totalSent >= 50) break

      // Check not already sent
      const { count: recentCount } = await supabase
        .from('sub_outreach_log')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('sub_email', sub.source_email)
        .eq('campaign_type', 'reactivation_30d')
        .gte('sent_at', new Date(Date.now() - 30 * 86400000).toISOString())

      if ((recentCount ?? 0) > 0) continue

      // Check not unsubscribed
      const { data: unsubRow } = await supabase
        .from('sub_outreach_log')
        .select('unsubscribed')
        .eq('org_id', org.id)
        .eq('sub_email', sub.source_email)
        .eq('unsubscribed', true)
        .limit(1)
        .maybeSingle()

      if (unsubRow) continue

      // Send email
      const subject = "We haven't heard from you — submit your latest pricing"
      const resp = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkToken,
        },
        body: JSON.stringify({
          From: 'bids@novaterra.ai',
          FromName: org.name,
          To: sub.source_email,
          Subject: subject,
          TextBody: `Hi ${sub.sub_company_name || 'there'},\n\nWe're actively reviewing bids and would love to include your pricing.\n\nSubmit here: ${vercelUrl}/portal?gc=${org.id}\n\nTo unsubscribe, reply with 'unsubscribe'.\n\n${org.name} via NOVA Core`,
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        await supabase.from('sub_outreach_log').insert({
          org_id: org.id,
          sub_email: sub.source_email,
          sub_company_name: sub.sub_company_name,
          campaign_type: 'reactivation_30d',
          email_subject: subject,
          postmark_message_id: data.MessageID,
        })
        totalSent++
      }
    }

    console.log(`[daily-outreach] ${org.name}: processed`)
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
