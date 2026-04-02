import { Box, Button, Chip, MenuItem, TextField } from "@mui/material";

export type OrderFiltersState = {
  search: string;
  status: string;
  master: string;
  serviceType: "all" | "repair" | "print";
  receivedDateFrom: string;
  receivedDateTo: string;
};

type Props = {
  value: OrderFiltersState;
  onChange: (next: OrderFiltersState) => void;
  onReset: () => void;
  masterOptions: Array<{ id: number; name: string }>;
  role: "admin" | "manager" | "master" | null;
  userId: number | null;
};

const statusLabel: Record<string, string> = {
  accepted: "Принят",
  diagnostics: "Диагностика",
  negotiation: "Согласование",
  waiting_parts: "Ожидание запчастей",
  repair: "В ремонте",
  ready: "Готов",
  completed: "Выдан",
};

export function OrderFilters({ value, onChange, onReset, masterOptions, role, userId }: Props) {
  const patch = (p: Partial<OrderFiltersState>) => onChange({ ...value, ...p });

  const activeFilters: Array<{ key: string; label: string; onDelete: () => void }> = [];
  if (value.status !== "all") {
    activeFilters.push({
      key: "status",
      label: `Статус: ${statusLabel[value.status] ?? value.status}`,
      onDelete: () => patch({ status: "all" }),
    });
  }
  if (value.master !== "all") {
    activeFilters.push({
      key: "master",
      label: `Мастер: ${value.master === "me" ? "Я" : masterOptions.find((m) => String(m.id) === value.master)?.name ?? value.master}`,
      onDelete: () => patch({ master: "all" }),
    });
  }
  if (value.receivedDateFrom) {
    activeFilters.push({
      key: "df",
      label: `Дата с: ${value.receivedDateFrom}`,
      onDelete: () => patch({ receivedDateFrom: "" }),
    });
  }
  if (value.receivedDateTo) {
    activeFilters.push({
      key: "dt",
      label: `Дата по: ${value.receivedDateTo}`,
      onDelete: () => patch({ receivedDateTo: "" }),
    });
  }
  if (value.serviceType !== "all") {
    activeFilters.push({
      key: "svc",
      label: `Услуга: ${value.serviceType === "repair" ? "Ремонт" : "Печать"}`,
      onDelete: () => patch({ serviceType: "all" }),
    });
  }

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.15fr 0.68fr 0.68fr 0.68fr 0.68fr 0.68fr auto" },
          gap: 1.5,
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <TextField
          fullWidth
          label="Поиск (номер / телефон / устройство)"
          value={value.search}
          onChange={(e) => patch({ search: e.target.value })}
        />
        <TextField select label="Статус" value={value.status} onChange={(e) => patch({ status: e.target.value })} fullWidth>
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="accepted">Принят</MenuItem>
          <MenuItem value="diagnostics">Диагностика</MenuItem>
          <MenuItem value="negotiation">Согласование</MenuItem>
          <MenuItem value="waiting_parts">Ожидание запчастей</MenuItem>
          <MenuItem value="repair">В ремонте</MenuItem>
          <MenuItem value="ready">Готов</MenuItem>
          <MenuItem value="completed">Выдан</MenuItem>
        </TextField>
        <TextField
          select
          label="Мастер"
          value={value.master}
          onChange={(e) => patch({ master: e.target.value })}
          fullWidth
          disabled={role === "master"}
        >
          <MenuItem value="all">{role === "master" ? "Только мои" : "Все"}</MenuItem>
          <MenuItem value="me" disabled={!userId}>
            Я
          </MenuItem>
          {masterOptions.map((m) => (
            <MenuItem key={m.id} value={String(m.id)}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Тип услуги" value={value.serviceType} onChange={(e) => patch({ serviceType: e.target.value as OrderFiltersState["serviceType"] })} fullWidth>
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="repair">Ремонт</MenuItem>
          <MenuItem value="print">Печать</MenuItem>
        </TextField>
        <TextField
          label="Дата с"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={value.receivedDateFrom}
          onChange={(e) => patch({ receivedDateFrom: e.target.value })}
          fullWidth
        />
        <TextField
          label="Дата по"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={value.receivedDateTo}
          onChange={(e) => patch({ receivedDateTo: e.target.value })}
          fullWidth
        />
        <Button variant="outlined" onClick={onReset} sx={{ justifySelf: { xs: "start", md: "end" } }}>
          Сбросить
        </Button>
      </Box>
      {activeFilters.length ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
          {activeFilters.map((f) => (
            <Chip key={f.key} label={f.label} onDelete={f.onDelete} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
