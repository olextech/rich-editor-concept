import { DEFAULT_PAGE_SETTINGS } from "./pageGeometry";

/** @type {import("./types.js").TemplateDefinition[]} */
export const TEMPLATES = [
  {
    id: "invoice",
    label: "Invoice",
    description: "Itemized billing document",
    pageSettings: { ...DEFAULT_PAGE_SETTINGS },
    html: `
      <h1>Invoice</h1>
      <p>
        <strong>From:</strong> Northwind Studio<br />
        12 Market Street, Kyiv, Ukraine<br />
        hello@northwind.studio
      </p>
      <p>
        <strong>Bill to:</strong> Aurora Logistics LLC<br />
        88 Harbor Road, Lviv, Ukraine
      </p>
      <p>
        <strong>Invoice no.</strong> {Invoice Number} ·
        <strong>Issue date</strong> {Issue Date} ·
        <strong>Due date</strong> {Due Date}
      </p>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{Item Description}</td>
            <td>{Item Qty}</td>
            <td>{Item Rate}</td>
            <td>{Item Amount}</td>
          </tr>
          <tr>
            <td><strong>Subtotal</strong></td>
            <td></td>
            <td></td>
            <td><strong>{Subtotal}</strong></td>
          </tr>
          <tr>
            <td>VAT ({Tax Rate})</td>
            <td></td>
            <td></td>
            <td>{Tax Amount}</td>
          </tr>
          <tr>
            <td><strong>Total due</strong></td>
            <td></td>
            <td></td>
            <td><strong>{Total}</strong></td>
          </tr>
        </tbody>
      </table>
      <h2>Payment details</h2>
      <p>
        Wire transfer to IBAN UA21 3052 9900 0002 6007 2335 1234.
        Reference {Invoice Number} on the payment.
      </p>
      <p>Thank you for working with Northwind Studio.</p>
    `,
  },
  {
    id: "estimate",
    label: "Estimate",
    description: "Pre-project cost proposal",
    pageSettings: { ...DEFAULT_PAGE_SETTINGS },
    html: `
      <h1>Project estimate</h1>
      <p>
        <strong>Prepared for:</strong> Helios Robotics<br />
        <strong>Prepared by:</strong> Northwind Studio<br />
        <strong>Valid through:</strong> 2026-06-15
      </p>
      <h2>Scope summary</h2>
      <p>
        Design and prototype the Helios operator console covering live telemetry,
        mission planning, and post-mission review. Two design iterations and one
        round of usability testing are included.
      </p>
      <h2>Cost breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Workstream</th>
            <th>Effort</th>
            <th>Rate</th>
            <th>Estimate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Discovery &amp; research</td>
            <td>40h</td>
            <td>$120</td>
            <td>$4,800</td>
          </tr>
          <tr>
            <td>Interaction &amp; visual design</td>
            <td>120h</td>
            <td>$120</td>
            <td>$14,400</td>
          </tr>
          <tr>
            <td>Prototype build</td>
            <td>80h</td>
            <td>$140</td>
            <td>$11,200</td>
          </tr>
          <tr>
            <td>Usability testing (n=8)</td>
            <td>32h</td>
            <td>$120</td>
            <td>$3,840</td>
          </tr>
          <tr>
            <td><strong>Estimated total</strong></td>
            <td></td>
            <td></td>
            <td><strong>$34,240</strong></td>
          </tr>
        </tbody>
      </table>
      <h2>Assumptions</h2>
      <ul>
        <li>One stakeholder review per iteration.</li>
        <li>Helios provides participants for usability testing.</li>
        <li>Visual design works from the existing Helios brand kit.</li>
      </ul>
      <p>
        This estimate is non-binding. A fixed statement of work follows after
        kickoff alignment.
      </p>
    `,
  },
  {
    id: "work-order",
    label: "Work Order",
    description: "On-site service authorization",
    pageSettings: { ...DEFAULT_PAGE_SETTINGS },
    html: `
      <h1>Work order</h1>
      <p>
        <strong>Order no.</strong> WO-2026-118 ·
        <strong>Date issued</strong> 2026-05-16 ·
        <strong>Scheduled</strong> 2026-05-22
      </p>
      <p>
        <strong>Site:</strong> Riverside Distribution Center, Dock 4<br />
        <strong>Contact:</strong> Maria Holub, Operations Lead<br />
        <strong>Phone:</strong> +380 50 222 0118
      </p>
      <h2>Requested work</h2>
      <ol>
        <li>Inspect dock leveler control panel for intermittent fault.</li>
        <li>Replace worn weather seals on bays 3 and 4.</li>
        <li>Calibrate loading bay light curtain sensors.</li>
      </ol>
      <h2>Parts &amp; labor</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Weather seal kit (bay)</td>
            <td>2</td>
            <td>$185.00</td>
            <td>$370.00</td>
          </tr>
          <tr>
            <td>Sensor calibration tool rental</td>
            <td>1</td>
            <td>$95.00</td>
            <td>$95.00</td>
          </tr>
          <tr>
            <td>On-site labor</td>
            <td>4h</td>
            <td>$110.00</td>
            <td>$440.00</td>
          </tr>
          <tr>
            <td><strong>Estimated total</strong></td>
            <td></td>
            <td></td>
            <td><strong>$905.00</strong></td>
          </tr>
        </tbody>
      </table>
      <h2>Authorization</h2>
      <p>
        Work performed under master service agreement MSA-2024-007.
        Site contact approval required before any additional labor.
      </p>
      <p>
        <strong>Authorized by:</strong> ____________________________________
      </p>
    `,
  },
];
