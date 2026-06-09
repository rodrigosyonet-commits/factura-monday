import fs from "fs";
import FormData from "form-data";

export async function subirArchivoMonday(itemId, filePath, columnId) {

  const formData = new FormData();

  formData.append("query", `
    mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
        id
      }
    }
  `);

  formData.append("variables", JSON.stringify({}));
  formData.append("map", JSON.stringify({ file: ["variables.file"] }));

  formData.append("file", fs.createReadStream(filePath));

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_API_KEY
    },
    body: formData
  });

  return res.json();
}
