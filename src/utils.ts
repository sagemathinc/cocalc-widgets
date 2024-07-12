// This used to be exported in the package @jupyter-widgets/base, but
// is not exported anymore, so we copy/paste it.
export type BufferJSON =
  | { [property: string]: BufferJSON }
  | BufferJSON[]
  | string
  | number
  | boolean
  | null
  | ArrayBuffer
  | DataView;
