export default function Recipient({ data, proposalStyles: PS, sectionNumber }) {
  const { project, masterData } = data;
  const cl = masterData.clients.find(c => c.company === project.client);

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666" };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...type.bodyBold, fontFamily: font, color: color.text, fontSize: type.bodyBold?.fontSize || 12, fontWeight: type.bodyBold?.fontWeight || 600 }}>{project.client || "[Client Name]"}</div>
        {cl && (
          <div style={{ ...type.body, fontFamily: font, color: color.textDim, fontSize: type.body?.fontSize || 11 }}>
            {cl.contact && <div>{cl.contact}</div>}
            {cl.address && <div>{cl.address}</div>}
            {cl.email && <div>{cl.email}</div>}
          </div>
        )}
      </div>
      <div style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 12, marginBottom: 12 }}>
        <strong style={{ ...type.bodyBold, fontFamily: font }}>RE: {project.name || "[Project Name]"}</strong>
        {project.address && <div style={{ ...type.body, fontFamily: font, color: color.textDim, fontSize: type.body?.fontSize || 11 }}>{project.address}</div>}
      </div>
    </>
  );
}
