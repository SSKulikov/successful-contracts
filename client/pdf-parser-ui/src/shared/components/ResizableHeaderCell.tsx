import type { HTMLAttributes, SyntheticEvent } from "react";
import { Resizable } from "react-resizable";
import type { ResizeCallbackData } from "react-resizable";

type ResizableHeaderCellProps = HTMLAttributes<HTMLElement> & {
  width?: number;
  onResize?: (event: SyntheticEvent<Element>, data: ResizeCallbackData) => void;
};

export function ResizableHeaderCell(props: ResizableHeaderCellProps) {
  const { width, onResize, ...restProps } = props;

  if (!width || !onResize) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={<span className="table-resize-handle" onClick={(event) => event.stopPropagation()} />}
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
}
