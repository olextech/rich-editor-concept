/**
 * Shared type definitions for the document editor.
 *
 * @typedef {"A4" | "A5"} PageSize
 * @typedef {"portrait" | "landscape"} PageOrientation
 *
 * @typedef {Object} PageMargins
 * @property {number} top    - millimetres
 * @property {number} right  - millimetres
 * @property {number} bottom - millimetres
 * @property {number} left   - millimetres
 *
 * @typedef {Object} PageSettings
 * @property {PageSize} pageSize
 * @property {PageOrientation} orientation
 * @property {PageMargins} margins
 *
 * @typedef {Object} TemplateDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} html              - default document content
 * @property {PageSettings} pageSettings
 *
 * @typedef {Object} TemplateState
 * @property {string} html
 * @property {PageSettings} pageSettings
 */

export {};
