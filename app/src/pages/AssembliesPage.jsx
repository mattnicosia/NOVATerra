import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDatabaseUiStore } from "@/stores/databaseUiStore";

export default function AssembliesPage() {
  const navigate = useNavigate();
  const setDbActiveTab = useDatabaseUiStore(s => s.setDbActiveTab);

  useEffect(() => {
    setDbActiveTab("assemblies");
    navigate("/core?tab=database", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
