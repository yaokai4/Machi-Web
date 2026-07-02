"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";
import { api, APIError, type KXSavedSearch } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useToasts } from "@/lib/store";
import { useI18n, type I18nKey } from "@/lib/i18n";

// 「订阅的搜索」管理页:列表 + 删除 + 通知频率。入口在我的工作台
// (/my/features),订阅动作在各 listing 频道与 /search 页。
export default function SavedSearchesPage() {
  const { t } = useI18n();
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const searches = useQuery({ queryKey: ["saved-searches"], queryFn: () => api.savedSearches() });

  const removeSearch = async (id: string) => {
    try {
      await api.deleteSavedSearch(id);
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const cadenceLabel = (cadence: KXSavedSearch["cadence"]) => {
    const key: I18nKey = cadence === "daily"
      ? "saved_search_cadence_daily"
      : cadence === "off"
        ? "saved_search_cadence_off"
        : "saved_search_cadence_instant";
    return t(key);
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-kx-feed px-3 py-4 sm:px-4">
        <header className="mb-4 px-1">
          <h1 className="flex items-center gap-2 text-xl font-black text-kx-text">
            <BellRing className="h-5 w-5 text-kx-accent" />
            {t("saved_search_title")}
          </h1>
          <p className="mt-1 text-sm font-semibold text-kx-muted">{t("saved_search_subtitle")}</p>
        </header>
        {searches.isLoading ? (
          <InlineLoading />
        ) : searches.isError ? (
          <ErrorState onRetry={() => searches.refetch()} />
        ) : searches.data && searches.data.length ? (
          <ul className="space-y-3">
            {searches.data.map((item) => (
              <li key={item.id} className="kx-card flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-kx-text">{item.label || item.keyword || item.category || item.vertical}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-kx-muted">
                    <span className="rounded-full bg-kx-soft px-2 py-0.5">{cadenceLabel(item.cadence)}</span>
                    <span>{t("saved_search_match_count")} {item.match_count}</span>
                    {item.created_at ? <span>· {String(item.created_at).slice(0, 10)}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSearch(item.id)}
                  aria-label={t("action_delete")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-kx-muted transition hover:bg-kx-soft hover:text-kx-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("saved_search_empty_title")} subtitle={t("saved_search_empty_sub")} />
        )}
      </main>
    </AppShell>
  );
}
