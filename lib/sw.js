async function getToken() {
  const res = await fetch("https://api.sw.com.mx/security/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user: process.env.SW_USER,
      password: process.env.SW_PASSWORD
    })
  });

  const data = await res.json();
  return data.token;
}

export async function timbrarCFDI(payload) {
  const token = await getToken();

  const res = await fetch("https://api.sw.com.mx/cfdi40/stamp/json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}
