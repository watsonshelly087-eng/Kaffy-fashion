const token = localStorage.getItem("token");

async function loadAllHistory() {
  const res = await fetch("/api/admin/all-history", { headers: { Authorization: token }});
  const data = await res.json();

  if (!data.success) return alert(data.message || "Error loading history");

  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = "";

  data.all.forEach(user => {
    user.history.forEach(h => {
      tbody.innerHTML += `
        <tr>
          <td>${new Date(h.time).toLocaleString()}</td>
          <td>${user.email}</td>
          <td>${h.template}</td>
          <td>${Object.keys(h.formats).filter(f => h.formats[f]).join(", ")}</td>
          <td><button onclick="deleteUser('${user.email}')">🗑 Delete</button></td>
        </tr>
      `;
    });
  });
}

async function deleteUser(email) {
  if (!confirm(`Are you sure you want to delete ${email}?`)) return;

  const res = await fetch("/api/admin/delete-user", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ email })
  });

  const data = await res.json();
  alert(data.message);
  if (data.success) loadAllHistory();
}