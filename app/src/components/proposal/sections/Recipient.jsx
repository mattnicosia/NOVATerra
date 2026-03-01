export default function Recipient({ data }) {
  const { project, masterData } = data;
  const cl = masterData.clients.find(c => c.company === project.client);
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{project.client || "[Client Name]"}</div>
        {cl && (
          <div style={{ fontSize: 11, color: "#666" }}>
            {cl.contact && <div>{cl.contact}</div>}
            {cl.address && <div>{cl.address}</div>}
            {cl.email && <div>{cl.email}</div>}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <strong>RE: {project.name || "[Project Name]"}</strong>
        {project.address && <div style={{ fontSize: 11, color: "#666" }}>{project.address}</div>}
      </div>
    </>
  );
}
