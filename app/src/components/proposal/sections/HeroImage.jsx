import { useReportsStore } from "@/stores/reportsStore";
import NovaInstructionBar from "../NovaInstructionBar";
import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { useProjectStore } from "@/stores/projectStore";

export default function HeroImage({ data, proposalStyles: PS }) {
  const heroImage = useReportsStore(s => s.heroImage);
  const setHeroImage = useReportsStore(s => s.setHeroImage);
  const project = useProjectStore(s => s.project);

  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e" };
  const font = PS?.font?.body || "'Inter', sans-serif";

  const [modifying, setModifying] = useState(false);

  if (!heroImage) return null;

  const handleModifyRendering = async (instruction) => {
    if (!instruction?.trim()) return;
    setModifying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/generate-rendering", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageBase64: heroImage,
          buildingType: project?.buildingType || "",
          projectName: project?.projectName || project?.name || "",
          modificationInstruction: instruction,
        }),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 200)); }
      if (!res.ok) throw new Error(json.error || "Modification failed");
      setHeroImage(json.image);
    } catch (err) {
      console.error("[HeroImage] Modification failed:", err.message);
    } finally {
      setModifying(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ borderRadius: 8, overflow: "hidden" }}>
        <img src={heroImage} alt="Project rendering" style={{ width: "100%", height: 280, objectFit: "cover", display: "block" }} />
      </div>
      <NovaInstructionBar
        onRegenerate={handleModifyRendering}
        generating={modifying}
        color={color}
        font={font}
      />
    </div>
  );
}
