"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Check, X, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { KXBookingSlot } from "@/lib/types";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

/**
 * Reservation calendar on a listing detail (no money). Renders nothing until
 * slots load and stays hidden when none exist (unless the viewer is the owner,
 * who can then publish the first slot). Consumes the same endpoints as iOS.
 */
function dayKeyOf(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ACCENT = "rgb(var(--kx-living-accent))";
const INK = "rgb(var(--kx-living-ink))";

export function ListingBookingSection({ listingId, listingType }: { listingId: string; listingType?: string }) {
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const [slots, setSlots] = useState<KXBookingSlot[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newWhen, setNewWhen] = useState("");
  const [newCap, setNewCap] = useState(1);
  const [newNote, setNewNote] = useState("");

  async function reload() {
    try {
      const res = await api.listingSlots(listingId);
      const sorted = [...(res.items || [])].sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));
      setSlots(sorted);
      setIsOwner(!!res.is_owner);
    } catch {
      /* hide section silently on failure */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const days = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; date: Date }[] = [];
    for (const s of slots) {
      const k = dayKeyOf(s.start_at);
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push({ key: k, date: new Date(s.start_at!) });
      }
    }
    return out;
  }, [slots]);

  useEffect(() => {
    if (!selectedDay && days.length) setSelectedDay(days[0].key);
  }, [days, selectedDay]);

  const activeDay = selectedDay || days[0]?.key || "";
  const daySlots = useMemo(() => slots.filter((s) => dayKeyOf(s.start_at) === activeDay), [slots, activeDay]);

  if (!loaded) return null;
  if (slots.length === 0 && !isOwner) return null;

  const title =
    listingType === "housing" || listingType === "rental" || listingType === "roommate"
      ? "看房预约"
      : listingType === "local_service" || listingType === "service" || listingType === "discount" || listingType === "event"
        ? "预约到店"
        : "预约时段";

  async function book(slot: KXBookingSlot) {
    if (busySlot) return;
    setBusySlot(slot.id);
    try {
      await api.bookSlot(listingId, slot.id);
      await reload();
      pushToast({ kind: "success", message: "预约成功，已加入「我的预约」" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as Error).message || "预约失败，请稍后再试" });
    } finally {
      setBusySlot(null);
    }
  }

  async function cancel(slot: KXBookingSlot) {
    if (busySlot) return;
    setBusySlot(slot.id);
    try {
      const mine = await api.myReservations();
      const b = mine.find((r) => r.slot_id === slot.id && (r.status || "confirmed") === "confirmed");
      if (!b) {
        pushToast({ kind: "error", message: "未找到该预约" });
        return;
      }
      await api.cancelReservation(b.id);
      await reload();
      pushToast({ kind: "success", message: "已取消预约" });
    } catch {
      pushToast({ kind: "error", message: "取消失败，请稍后再试" });
    } finally {
      setBusySlot(null);
    }
  }

  async function addSlot() {
    if (!newWhen) {
      pushToast({ kind: "error", message: "请选择时间" });
      return;
    }
    try {
      const iso = new Date(newWhen).toISOString();
      await api.createListingSlots(listingId, [{ start_at: iso, capacity: newCap, note: newNote.trim() }]);
      setShowAdd(false);
      setNewWhen("");
      setNewCap(1);
      setNewNote("");
      await reload();
      pushToast({ kind: "success", message: "时段已添加" });
    } catch {
      pushToast({ kind: "error", message: "添加失败，请重试" });
    }
  }

  async function removeSlot(slot: KXBookingSlot) {
    if (typeof window !== "undefined" && !window.confirm("删除这个预约时段？已预约的用户会收到取消通知。")) return;
    try {
      await api.deleteListingSlot(listingId, slot.id);
      await reload();
      pushToast({ kind: "success", message: "时段已删除" });
    } catch {
      pushToast({ kind: "error", message: "删除失败，请重试" });
    }
  }

  return (
    <section className="kx-living-surface mt-6 rounded-3xl p-5">
      <h3 className="flex items-center gap-2 text-lg font-black" style={{ color: INK }}>
        <CalendarClock className="h-5 w-5" style={{ color: ACCENT }} />
        {title}
      </h3>

      {slots.length === 0 ? (
        <p className="mt-3 text-sm text-[rgb(var(--kx-living-muted))]">
          还没有可预约的时段，添加后买家 / 租客就能直接在线预约。
        </p>
      ) : (
        <>
          {/* Day strip */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {days.map(({ key, date }) => {
              const on = key === activeDay;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className="flex min-w-[3.25rem] flex-col items-center rounded-2xl px-3 py-2 transition active:scale-95"
                  style={{
                    background: on ? ACCENT : "rgb(var(--kx-living-soft))",
                    color: on ? "#fff" : INK,
                  }}
                >
                  <span className="text-[11px] font-semibold">
                    {date.toLocaleDateString("zh-CN", { weekday: "short" })}
                  </span>
                  <span className="text-base font-black">
                    {date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Slot chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {daySlots.map((slot) => {
              const booked = !!slot.booked_by_me;
              const cap = slot.capacity ?? 1;
              const used = slot.booked_count ?? 0;
              const avail = slot.available ?? Math.max(0, cap - used);
              const full = (slot.is_full ?? avail <= 0) && !booked;
              const busy = busySlot === slot.id;
              const time = slot.start_at
                ? new Date(slot.start_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
                : "";
              return (
                <div key={slot.id} className="flex items-center">
                  <button
                    type="button"
                    disabled={busy || (!isOwner && full && !booked)}
                    onClick={() => {
                      if (isOwner) return;
                      if (booked) cancel(slot);
                      else book(slot);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition active:scale-95 disabled:opacity-60"
                    style={{
                      borderColor: booked ? ACCENT : full ? "rgba(100,116,139,0.3)" : "rgba(var(--kx-living-accent),0.45)",
                      background: booked ? "rgba(var(--kx-living-accent),0.12)" : "rgb(var(--kx-living-surface))",
                      color: booked ? ACCENT : full ? "rgb(100,116,139)" : INK,
                    }}
                    title={isOwner ? "管理时段" : booked ? "点击取消预约" : full ? "已约满" : "点击预约"}
                  >
                    {booked ? <Check className="h-3.5 w-3.5" /> : null}
                    <span>{time}</span>
                    <span className="text-[11px] font-semibold opacity-80">
                      {booked ? "已预约" : full ? "已约满" : `剩${avail}`}
                    </span>
                  </button>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => removeSlot(slot)}
                      aria-label={t("aria_delete_slot")}
                      className="-ml-1 rounded-full p-1 text-kx-subtle transition hover:text-kx-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Owner: add a slot */}
      {isOwner ? (
        <div className="mt-4">
          {showAdd ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(var(--kx-living-accent),0.3)] p-3">
              <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: INK }}>
                时间
                <input type="datetime-local" value={newWhen} onChange={(e) => setNewWhen(e.target.value)} className="kx-input" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: INK }}>
                可约人数
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newCap}
                  onChange={(e) => setNewCap(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="kx-input"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: INK }}>
                备注（可选）
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="如「每场30分钟」"
                  className="kx-input"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addSlot}
                  className="rounded-full px-4 py-2 text-sm font-black text-white"
                  style={{ background: ACCENT }}
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-full px-4 py-2 text-sm font-semibold"
                  style={{ color: INK }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm font-bold"
              style={{ color: ACCENT }}
            >
              <Plus className="h-4 w-4" />
              添加预约时段
            </button>
          )}
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-[rgb(var(--kx-living-muted))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        预约不收取任何费用，具体时间请到店 / 看房时与对方确认。
      </p>
    </section>
  );
}
