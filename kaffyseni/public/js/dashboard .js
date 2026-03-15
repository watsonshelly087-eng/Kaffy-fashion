import { supabase } from './supabaseClient.js';

// Example: get logged-in user
async function getUser() {
  const { data } = await supabase.auth.getUser();
  console.log("Logged-in user:", data.user);
}
getUser();
const token = localStorage.getItem("token");

async function saveReport() {
  const template = document.getElementById("template").value;
  const formats = {
    pdf: document.getElementById("pdf").checked,
    docx: document.getElementById("docx").checked,
    csv: document.getElementById("csv").checked
  };

  const res = await fetch("/api/save-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ template, formats })
  });

  const data = await res.json();
  alert(data.message);
  loadHistory();
}

async function loadHistory() {
  const res = await fetch("/api/history", { headers: { Authorization: token } });
  const data = await res.json();

  if (data.success) {
    const tbody = document.querySelector("#historyTable tbody");
    tbody.innerHTML = "";
    data.history.forEach(h => {
      tbody.innerHTML += `
        <tr>
          <td>${new Date(h.time).toLocaleString()}</td>
          <td>${h.template}</td>
          <td>${Object.keys(h.formats).filter(f => h.formats[f]).join(", ")}</td>
        </tr>
      `;
    });
  }
}

window.onload = loadHistory;