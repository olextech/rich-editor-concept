const marginFields = [
  { key: "top", label: "Top margin" },
  { key: "right", label: "Right margin" },
  { key: "bottom", label: "Bottom margin" },
  { key: "left", label: "Left margin" },
];

function toMarginValue(value) {
  const nextValue = Number(value);

  if (Number.isNaN(nextValue) || nextValue < 0) {
    return 0;
  }

  return nextValue;
}

export default function PageSettingsBar({ pageSettings, onChange }) {
  function updatePageSize(event) {
    onChange({
      ...pageSettings,
      pageSize: event.target.value,
    });
  }

  function updateOrientation(event) {
    onChange({
      ...pageSettings,
      orientation: event.target.value,
    });
  }

  function updateMargin(side, value) {
    onChange({
      ...pageSettings,
      margins: {
        ...pageSettings.margins,
        [side]: toMarginValue(value),
      },
    });
  }

  return (
    <section className="page-settings-bar">
      <div className="page-settings-bar__grid">
        <label className="page-settings-bar__field">
          <span className="page-settings-bar__label">Page size</span>
          <select
            className="page-settings-bar__select"
            value={pageSettings.pageSize}
            onChange={updatePageSize}
          >
            <option value="A4">A4</option>
            <option value="A5">A5</option>
          </select>
        </label>

        <label className="page-settings-bar__field">
          <span className="page-settings-bar__label">Orientation</span>
          <select
            className="page-settings-bar__select"
            value={pageSettings.orientation}
            onChange={updateOrientation}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>

        {marginFields.map(({ key, label }) => (
          <label key={key} className="page-settings-bar__field">
            <span className="page-settings-bar__label">{label}</span>
            <input
              className="page-settings-bar__input"
              type="number"
              min="0"
              step="1"
              value={pageSettings.margins[key]}
              onChange={(event) => {
                updateMargin(key, event.target.value);
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
