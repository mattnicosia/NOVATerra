import { CSI } from "./csi";
import { NAHB } from "./nahb";

export const CODE_SYSTEMS = {
  "csi-commercial": { id: "csi-commercial", name: "CSI MasterFormat", desc: "49-division commercial standard (MasterFormat 2020). Used by commercial GCs, institutional, and public works.", codes: CSI, icon: "\u{1F3D7}\uFE0F" },
  "nahb-residential": { id: "nahb-residential", name: "NAHB Residential", desc: "22-category trade-based system for home builders & remodelers. Organized by construction phase.", codes: NAHB, icon: "\u{1F3E0}" },
};
