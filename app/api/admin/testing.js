import { supabaseAdmin, verifyAdmin } from '../lib/supabaseAdmin.js';
import { cors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: "Forbidden" });

  try {
    if (req.method === "GET") {
      const { status, run_type, limit = 20, offset = 0 } = req.query;

      let query = supabaseAdmin
        .from("ai_test_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      if (status) query = query.eq("status", status);
      if (run_type) query = query.eq("run_type", run_type);

      const [runsRes, countRes] = await Promise.all([
        query,
        supabaseAdmin.from("ai_test_runs").select("id", { count: "exact", head: true }),
      ]);

      // Fetch journey results for returned runs
      const runIds = (runsRes.data || []).map(r => r.id);
      let journeys = [];
      if (runIds.length > 0) {
        const { data } = await supabaseAdmin
          .from("ai_test_journey_results")
          .select("*")
          .in("run_id", runIds)
          .order("journey_number", { ascending: true });
        journeys = data || [];
      }

      // Group journeys by run_id
      const journeysByRun = {};
      journeys.forEach(j => {
        if (!journeysByRun[j.run_id]) journeysByRun[j.run_id] = [];
        journeysByRun[j.run_id].push(j);
      });

      const runs = (runsRes.data || []).map(r => ({
        ...r,
        journeys: journeysByRun[r.id] || [],
      }));

      return res.status(200).json({
        runs,
        total: countRes?.count || 0,
      });
    }

    if (req.method === "POST") {
      const body = req.body;

      if (body.action === "create_run") {
        const { data, error } = await supabaseAdmin
          .from("ai_test_runs")
          .insert({
            run_type: body.run_type,
            status: "running",
            trigger_source: body.trigger_source || "manual",
            changed_files: body.changed_files || null,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      if (body.action === "finish_run") {
        const { data, error } = await supabaseAdmin
          .from("ai_test_runs")
          .update({
            status: body.status,
            finished_at: new Date().toISOString(),
            duration_ms: body.duration_ms,
            test_files_total: body.test_files_total,
            test_files_passed: body.test_files_passed,
            tests_total: body.tests_total,
            tests_passed: body.tests_passed,
            build_passed: body.build_passed,
            build_error: body.build_error,
            summary: body.summary,
          })
          .eq("id", body.run_id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (body.action === "add_journey") {
        const { data, error } = await supabaseAdmin
          .from("ai_test_journey_results")
          .insert({
            run_id: body.run_id,
            journey_name: body.journey_name,
            journey_number: body.journey_number,
            result: body.result,
            failure_class: body.failure_class || null,
            component_involved: body.component_involved || null,
            explanation: body.explanation || null,
            screenshot_url: body.screenshot_url || null,
            snapshot_data: body.snapshot_data || null,
            started_at: body.started_at,
            finished_at: body.finished_at,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin testing error:", err.message);
    return res.status(500).json({ error: err.message || "Failed" });
  }
}
