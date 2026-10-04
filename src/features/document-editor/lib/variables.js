import sampleValues from "../../../../shared/variable-values.json";
import tableVariables from "../../../../shared/table-variables.json";

export const DEMO_VARIABLE_VALUES = Object.freeze({
  ...sampleValues,
  ...tableVariables.footerValues,
});
export const DEMO_TABLE_ROWS = tableVariables.rows;

export const VARIABLE_GROUPS = [
  {
    id: "company",
    label: "Company",
    variables: [
      "{Company Name}",
      "{Company Address}",
      "{Company Email}",
      "{Company Details}",
      "{Company Note}",
    ],
  },
  {
    id: "legal-entity",
    label: "Legal entity",
    variables: [
      "{Legal Entity Name}",
      "{Legal Entity Address}",
      "{Legal Entity Email}",
      "{Legal Entity Details}",
      "{Legal Entity Note}",
    ],
  },
  {
    id: "client",
    label: "Client",
    variables: [
      "{Client Name}",
      "{Client Address}",
      "{Client Email}",
      "{Client Details}",
      "{Client Note}",
    ],
  },
  {
    id: "invoice",
    label: "Invoice",
    variables: ["{Invoice Number}", "{Issue Date}", "{Due Date}"],
  },
  {
    id: "table-body",
    label: "Table body",
    description:
      "Put item variables in one body row. Print and PDF repeat it for each item.",
    variables: tableVariables.bodyVariables,
  },
  {
    id: "table-footer",
    label: "Table footer",
    description: "Totals for the sample items.",
    variables: Object.keys(tableVariables.footerValues),
  },
];
