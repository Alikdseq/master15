import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import type { ClientsListQuery } from "../clientsUrlParams";
import { DEVICE_TYPES } from "../../orders/createOrderSchema";

type Props = {
  value: ClientsListQuery;
  onChange: (next: ClientsListQuery) => void;
  onApply: () => void;
  onReset: () => void;
  tagOptions: string[];
};

export function ClientFilters({ value, onChange, onApply, onReset, tagOptions }: Props) {
  const patch = (partial: Partial<ClientsListQuery>) => onChange({ ...value, ...partial, page: 1 });

  return (
    <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 2, "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography fontWeight={600}>Расширенные фильтры</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <Autocomplete
            multiple
            freeSolo
            options={tagOptions}
            value={value.tags}
            onChange={(_, v) => patch({ tags: v.map((x) => String(x).trim()).filter(Boolean) })}
            renderInput={(params) => <TextField {...params} label="Теги" placeholder="Выберите или введите" />}
          />
          <TextField
            label="Тип устройства (в заказах)"
            select
            value={value.deviceType}
            onChange={(e) => patch({ deviceType: e.target.value })}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">Любой</MenuItem>
            {DEVICE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Первое обращение с"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={value.createdFrom}
            onChange={(e) => patch({ createdFrom: e.target.value })}
          />
          <TextField
            label="Первое обращение по"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={value.createdTo}
            onChange={(e) => patch({ createdTo: e.target.value })}
          />
          <TextField
            label="Последний заказ с"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={value.lastOrderFrom}
            onChange={(e) => patch({ lastOrderFrom: e.target.value })}
          />
          <TextField
            label="Последний заказ по"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={value.lastOrderTo}
            onChange={(e) => patch({ lastOrderTo: e.target.value })}
          />
          <TextField
            label="Заказов не меньше"
            type="number"
            inputProps={{ min: 0 }}
            value={value.ordersMin}
            onChange={(e) => patch({ ordersMin: e.target.value })}
          />
          <TextField
            label="Заказов не больше"
            type="number"
            inputProps={{ min: 0 }}
            value={value.ordersMax}
            onChange={(e) => patch({ ordersMax: e.target.value })}
          />
          <FormControlLabel
            control={<Checkbox checked={value.activeOrdersOnly} onChange={(_, c) => patch({ activeOrdersOnly: c })} />}
            label="Только с активными заказами"
            sx={{ gridColumn: { md: "1 / -1" } }}
          />
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={onApply}>
            Применить
          </Button>
          <Button
            onClick={() => {
              onReset();
            }}
          >
            Сбросить
          </Button>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
