import { Autocomplete, Chip, TextField } from "@mui/material";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
};

export function TagSelector({ value, onChange, disabled, label = "Теги", placeholder }: Props) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={[]}
      value={value}
      onChange={(_, v) => onChange(v.map((x) => String(x).trim()).filter(Boolean))}
      disabled={disabled}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => <Chip variant="outlined" label={option} {...getTagProps({ index })} key={option} />)
      }
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} />}
    />
  );
}
