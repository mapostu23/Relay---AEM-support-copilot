import { label } from "../../shared/types.js";
export function Select<const Values extends readonly string[]>({
  name,
  value,
  values,
  onChange,
}: {
  name: string;
  value: Values[number];
  values: Values;
  onChange: (v: Values[number]) => void;
}) {
  return (
    <label>
      {name}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Values[number])}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
