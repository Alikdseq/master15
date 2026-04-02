import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import type { InventoryListQuery } from "../inventoryUrlParams";

type Props = {
  value: InventoryListQuery;
  onChange: (next: InventoryListQuery) => void;
  categoryOptions: Array<{ id: number; name: string }>;
  onApply: () => void;
  onReset: () => void;
};

export function InventoryFilters({ value, onChange, categoryOptions, onApply, onReset }: Props) {
  const patch = (partial: Partial<InventoryListQuery>) => onChange({ ...value, ...partial, page: 1 });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        mb: 2,
        p: 2,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <Typography fontWeight={600}>Фильтры</Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "2fr 1fr 1fr auto" },
          alignItems: "center",
        }}
      >
        <TextField
          label="Поиск по названию или артикулу"
          value={value.search}
          onChange={(e) => patch({ search: e.target.value })}
          size="small"
          fullWidth
        />
        <TextField
          label="Категория"
          select
          size="small"
          value={value.category}
          onChange={(e) => patch({ category: e.target.value })}
          fullWidth
        >
          <MenuItem value="">Все</MenuItem>
          {categoryOptions.map((c) => (
            <MenuItem key={c.id} value={String(c.id)}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={value.lowStockOnly}
              onChange={(_, v) => patch({ lowStockOnly: v })}
            />
          }
          label="Только ниже порога"
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={onApply}>
            Применить
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              onReset();
            }}
          >
            Сбросить
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
