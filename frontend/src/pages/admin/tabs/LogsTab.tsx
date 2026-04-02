import { Box, Button, TextField, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { getCount, getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

type AuditRow = {
  id: number;
  created_at: string;
  action: string;
  object_type: string;
  object_id: string | number | null;
  actor: number | null;
  actor_email?: string;
  actor_name?: string;
  meta: unknown;
};

export function LogsTab({ onNotify }: { onNotify: NotifyFn }) {
  const [draft, setDraft] = useState({
    action: "",
    actor: "",
    type: "",
    search: "",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState(draft);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: paginationModel.page + 1,
        page_size: paginationModel.pageSize,
      };
      if (applied.action.trim()) params.action = applied.action.trim();
      if (applied.actor.trim()) params.actor = applied.actor.trim();
      if (applied.type.trim()) params.object_type = applied.type.trim();
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      if (applied.search.trim()) params.search = applied.search.trim();
      const r = await api.get("/admin/audit-logs/", { params });
      setRows(getResults<AuditRow>(r.data));
      setRowCount(getCount(r.data));
    } catch {
      onNotify("Ошибка загрузки журнала", "error");
      setRows([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  }, [applied, onNotify, paginationModel.page, paginationModel.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setApplied({ ...draft });
    setPaginationModel((m) => ({ ...m, page: 0 }));
  };

  const columns: GridColDef<AuditRow>[] = useMemo(
    () => [
      { field: "created_at", headerName: "Дата/время", width: 180 },
      { field: "actor_email", headerName: "Пользователь", width: 200, valueGetter: (_v, r) => r.actor_email ?? r.actor_name ?? "—" },
      { field: "action", headerName: "Действие", width: 200 },
      { field: "object_type", headerName: "Сущность", width: 160 },
      { field: "object_id", headerName: "ID", width: 100 },
      {
        field: "meta",
        headerName: "Изменения / meta",
        flex: 1,
        minWidth: 220,
        sortable: false,
        renderCell: (p) => (
          <span style={{ fontFamily: "monospace", fontSize: 12 }}>{JSON.stringify(p.row.meta ?? {})}</span>
        ),
      },
    ],
    []
  );

  const exportXlsx = async () => {
    try {
      const params: Record<string, string> = {};
      if (applied.action.trim()) params.action = applied.action.trim();
      if (applied.actor.trim()) params.actor = applied.actor.trim();
      if (applied.type.trim()) params.object_type = applied.type.trim();
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      if (applied.search.trim()) params.search = applied.search.trim();
      const r = await api.get("/admin/audit-logs/export/", { params, responseType: "blob" });
      const blob = new Blob([r.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit_logs.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onNotify("Экспорт XLSX начат", "success");
    } catch {
      onNotify("Ошибка экспорта", "error");
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="subtitle1">Журнал действий (аудит)</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
        <TextField
          label="Действие (точное)"
          value={draft.action}
          onChange={(e) => setDraft((f) => ({ ...f, action: e.target.value }))}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="Поиск по действию"
          value={draft.search}
          onChange={(e) => setDraft((f) => ({ ...f, search: e.target.value }))}
          sx={{ minWidth: 180 }}
        />
        <TextField
          label="Пользователь (id)"
          value={draft.actor}
          onChange={(e) => setDraft((f) => ({ ...f, actor: e.target.value }))}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="Тип объекта"
          value={draft.type}
          onChange={(e) => setDraft((f) => ({ ...f, type: e.target.value }))}
          sx={{ minWidth: 160 }}
        />
        <TextField
          type="date"
          label="С даты"
          InputLabelProps={{ shrink: true }}
          value={draft.from}
          onChange={(e) => setDraft((f) => ({ ...f, from: e.target.value }))}
        />
        <TextField
          type="date"
          label="По дату"
          InputLabelProps={{ shrink: true }}
          value={draft.to}
          onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value }))}
        />
        <Button variant="contained" onClick={() => applyFilters()}>
          Применить
        </Button>
        <Button variant="outlined" onClick={() => void exportXlsx()}>
          Экспорт XLSX
        </Button>
      </Box>

      <Box sx={{ height: 520, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => r.id}
          rowCount={rowCount}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>
    </Box>
  );
}
