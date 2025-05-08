export interface SimNodeDataSimpleAdvanceRate {
  numerator?: string;
  denominator?: string;
}

export interface SimNodeDataAttestedValue {
  value?: string;
}

export interface SimNodeVariantData {
  __variant__?: string;
  node?: {
    __variant__?: string;
    _0?: SimNodeDataSimpleAdvanceRate;
  };
  _0?: {
    __variant__?: string;
    _0?: SimNodeDataAttestedValue;
  };
}

export interface SimBorrowingBaseNode {
  __variant__: string;
  _0?: SimNodeVariantData;
}

export interface SimDataField {
  nodes?: SimBorrowingBaseNode[];
  _0?: {
    facility?: string;
    current_contributed?: string;
  };
  // Potentially other fields for other types
}

export interface SimChangeTopLevelData {
  type: string;
  data?: SimDataField;
}

export interface SimulationResultChange {
  address: string;
  data?: SimChangeTopLevelData;
}
