export function construirCFDI(data) {

  return {
    credentials: {
      certificate: process.env.SW_CER,
      key: process.env.SW_KEY,
      password: process.env.SW_CERT_PASSWORD
    },

    cfdi: {
      Comprobante: {
        TipoDeComprobante: "I",
        MetodoPago: "PUE",
        Moneda: "MXN"
      },

      Emisor: {
        Rfc: process.env.RFC_EMISOR,
        Nombre: process.env.NOMBRE_EMISOR,
        RegimenFiscal: "601"
      },

      Receptor: {
        // 🔴 AQUÍ VIENEN DATOS DE MONDAY
        Rfc: data.rfc,
        Nombre: data.cliente,
        UsoCFDI: data.uso_cfdi
      },

      Conceptos: [
        {
          ClaveProdServ: "01010101",
          Cantidad: 1,
          ClaveUnidad: "ACT",
          Descripcion: "Servicio",

          // 🔴 DATOS DESDE MONDAY
          ValorUnitario: Number(data.monto),
          Importe: Number(data.monto)
        }
      ]
    }
  };
}
