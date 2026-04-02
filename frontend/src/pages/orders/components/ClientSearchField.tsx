import { Alert, Autocomplete, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";

export type ClientOption = { id: number; name: string; phone: string; email?: string };

type Props = {
  value: ClientOption | null;
  onChange: (c: ClientOption | null) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  disabled?: boolean;
  /** Показать кнопку, если по запросу никого нет (новый клиент). */
  emptySearchAction?: { label: string; onClick: () => void };
};

export function ClientSearchField({
  value,
  onChange,
  inputValue,
  onInputChange,
  disabled,
  emptySearchAction,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ClientOption[]>([]);
  const debounced = useDebouncedValue(inputValue.trim(), 300);

  const minChars = 3;
  const canSearch = debounced.length >= minChars;

  useEffect(() => {
    if (!canSearch) {
      setOptions([]);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const r = await api.get("/clients/", {
          params: { search: debounced, page_size: 20 },
        });
        if (!active) return;
        const rows = (r.data?.results ?? []) as any[];
        setOptions(
          rows.map((x) => ({
            id: x.id,
            name: x.name,
            phone: x.phone,
            email: x.email ?? "",
          }))
        );
      } catch {
        if (active) setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canSearch, debounced]);

  const hint = useMemo(() => {
    if (inputValue.trim().length < minChars) {
      return `Введите минимум ${minChars} символа (телефон, имя или email)`;
    }
    return null;
  }, [inputValue, minChars]);

  const showEmptyHint =
    Boolean(emptySearchAction) && canSearch && !loading && options.length === 0 && !value;

  return (
    <Box>
      <Autocomplete
        disabled={disabled}
        options={options}
        loading={loading}
        value={value}
        onChange={(_, v) => {
          onChange(v);
          if (v) onInputChange(`${v.name} · ${v.phone}`);
        }}
        inputValue={inputValue}
        onInputChange={(_, v) => {
          onInputChange(v);
          if (value) onChange(null);
        }}
        getOptionLabel={(o) => `${o.name} · ${o.phone}`}
        filterOptions={(x) => x}
        noOptionsText={canSearch ? "Клиенты не найдены" : "Введите цифры телефона"}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Поиск клиента по телефону / имени"
            placeholder="Например 918 или Иванов"
            required
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          {hint}
        </Typography>
      ) : null}
      {showEmptyHint && emptySearchAction ? (
        <Alert
          severity="info"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={emptySearchAction.onClick}>
              {emptySearchAction.label}
            </Button>
          }
        >
          Клиент не найден. Можно добавить нового — он будет создан вместе с заказом.
        </Alert>
      ) : null}
    </Box>
  );
}
