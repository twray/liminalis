const prettifyJSON = (
  obj: Record<string, any>,
  truncateNumericValues?: number
): string => {
  const entries = Object.entries(obj);

  return entries
    .map(([key, value]) => {
      let formattedValue: string;

      if (typeof value === "string") {
        formattedValue = `<span style="color: #1A1AA6;">"${value}"</span>`;
      } else if (typeof value === "number") {
        formattedValue = `<span style="color: #1C00CF;">${
          truncateNumericValues ? value.toFixed(truncateNumericValues) : value
        }</span>`;
      } else if (typeof value === "boolean") {
        formattedValue = `<span style="color: #0D47A1;">${value}</span>`;
      } else if (value === null) {
        formattedValue = `<span style="color: #9E9E9E;">null</span>`;
      } else if (typeof value === "object") {
        formattedValue = JSON.stringify(value);
      } else {
        formattedValue = String(value);
      }

      return `<span style="color: #881391;">${key}</span>: ${formattedValue}`;
    })
    .join("<br>");
};

type Loggable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, any>;

export const log = (() => {
  let timeoutId: number | null = null;

  return (message: Loggable, truncateNumericValues?: number) => {
    const canvas = document.querySelector("#canvas-visualisation");

    if (!canvas) return;

    let logWindow = document.querySelector("#log-window");

    if (!logWindow) {
      const canvasBoundingRect = canvas.getBoundingClientRect();
      const { top } = canvasBoundingRect;

      logWindow = document.createElement("div") as HTMLDivElement;
      logWindow.setAttribute("id", "log-window");

      Object.assign((logWindow as HTMLDivElement).style, {
        position: "absolute",
        top: `${top + 10}px`,
        left: `${canvasBoundingRect.left + 10}px`,
        right: `${canvasBoundingRect.left + 10}px`,
        padding: "10px",
        borderRadius: "6px",
        color: "#555",
        backgroundColor: "white",
        border: "1px solid #EEE",
        fontFamily: "monospace",
        fontSize: "10px",
        maxWidth: "500px",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap",
      });

      canvas.after(logWindow);
    }

    let displayedMessage;

    if (typeof message === "object" && message !== null) {
      displayedMessage = prettifyJSON(message, truncateNumericValues);
    } else if (typeof message === "number" && truncateNumericValues) {
      displayedMessage = `${message.toFixed(truncateNumericValues)}`;
    } else {
      displayedMessage = `${message}`;
    }

    logWindow.innerHTML = displayedMessage;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      const logWindowToRemove = document.querySelector("#log-window");
      if (logWindowToRemove) {
        logWindowToRemove.remove();
      }
      timeoutId = null;
    }, 5000);
  };
})();
