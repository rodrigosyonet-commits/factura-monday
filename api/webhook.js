import { construirCFDI } from "../lib/cfdi.js";
import { timbrarCFDI } from "../lib/sw.js";

export default async function handler(req, res) {

  if (req.method === "GET") {
    return res.status(200).send(req.query.challenge);
  }

  try {
    const data = req.body;

    console.log("📩 DATA MONDAY:", data);

    // 🔴 DATOS que vienen de Monday
    const values = data;

    const cfdi = construirCFDI(values);

    const result = await timbrarCFDI(cfdi);

    console.log("✅ TIMBRADO:", result);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ ERROR:", error);
    return res.status(500).send(error.message);
  }
}
