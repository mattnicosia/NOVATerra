import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDatabaseStore } from "@/stores/databaseStore";

export default function AssembliesPage() {
  const navigate = useNavigate();
  const setDbActiveTab = useDatabaseStore(s => s.setDbActiveTab);

  useEffect(() => {
    setDbActiveTab("assemblies");
    navigate("/core?tab=database", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
