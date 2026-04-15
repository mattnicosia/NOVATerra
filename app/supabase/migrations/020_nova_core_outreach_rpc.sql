CREATE OR REPLACE FUNCTION get_reactivation_candidates(p_org_id UUID)
RETURNS TABLE(source_email TEXT, sub_company_name TEXT, last_submission TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT pal.source_email, pal.sub_company_name, MAX(pal.created_at)
  FROM parser_audit_log pal
  WHERE pal.org_id = p_org_id
    AND pal.source_email IS NOT NULL
    AND pal.source_email NOT LIKE '%(upload)%'
    AND pal.error_message IS NULL
  GROUP BY pal.source_email, pal.sub_company_name
  HAVING MAX(pal.created_at) < NOW() - INTERVAL '30 days'
  ORDER BY MAX(pal.created_at) ASC
  LIMIT 50;
END;
$$;
