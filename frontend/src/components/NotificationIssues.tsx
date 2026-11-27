import { useEffect, useState } from "react";
import { authFetch } from "@/utils/auth.utils";
type Issue = { customId: string; title: string; notificationStatus: string; notificationAttempts?: number; notificationClaimedAt?: string };
const base = process.env.NEXT_PUBLIC_BACKEND_URL + "/api/articles";
export default function NotificationIssues() {
  const [rows, setRows] = useState<Issue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const response = await authFetch(base + "/moderator/notification-issues");
      if (!response.ok) throw new Error("Unable to load notification status");
      setRows(await response.json());
    } catch (e) { setMessage(String(e)); }
  }
  useEffect(() => { void refresh(); }, []);
  async function retry(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await authFetch(base + "/" + encodeURIComponent(id) + "/notification/retry", { method: "POST" });
      if (!response.ok) throw new Error("Notification is not eligible for retry");
      setMessage("Notification queued."); await refresh();
    } catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  return <section style={{padding:16,marginTop:16,border:"1px solid #ddd",borderRadius:8}}>
    <h2>Review notification issues</h2>
    <button type="button" onClick={() => void refresh()}>Refresh</button>
    {message && <p role="status">{message}</p>}
    {rows.length === 0 && <p>No failed or in-flight notifications.</p>}
    {rows.map(row => <div key={row.customId} style={{padding:"8px 0"}}>
      <strong>{row.title}</strong> — {row.notificationStatus} ({row.notificationAttempts || 0} attempts)
      <button type="button" disabled={busy || (row.notificationStatus === "Sending" && (!row.notificationClaimedAt || Date.now() - Date.parse(row.notificationClaimedAt) < 900000))} onClick={() => { if (row.notificationStatus !== "Sending" || window.confirm("Delivery may already have occurred. Retry anyway?")) void retry(row.customId); }}>Retry</button>
    </div>)}
  </section>;
}
