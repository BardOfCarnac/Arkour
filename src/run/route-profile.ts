export const RUN_ROUTE_PROFILE = {
  /** Hard radius reserved around every valid traversal route before scenery is admitted. */
  sceneryClearance: 3.2,
  /** Maximum spacing used to approximate curved routes with keep-out line segments. */
  corridorSampleStep: 1.25,
} as const;
