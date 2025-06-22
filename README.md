# Hebcal Jewish holidays and Hebrew calednar Model Context Protocol (MCP) server

Hebcal (pronounced *HEEB-kal*, as in **Heb**rew **cal**endar) is a free Jewish calendar and holiday web site.

Our mission is to increase awareness of Jewish holidays and to help Jews to be observant of the mitzvot.

This repository is the MCP server equivalent of the powerful [custom Jewish calendar](https://www.hebcal.com/hebcal) tool that lets you generate a list of Jewish holidays for any year (past, present or future).

Also available are a Hebrew [date converter](https://www.hebcal.com/converter), [Shabbat candle lighting times](https://www.hebcal.com/shabbat) and [Torah readings](https://www.hebcal.com/sedrot/) (both full *kriyah* and triennial system), and a page to look up [yahrzeits, birthdays and anniversaries](https://www.hebcal.com/yahrzeit).

## Running the Server

This MCP server can run in two modes:

1.  **Stdio Mode (default):** Communicates over standard input/output.
    ```bash
    npm install
    npm run build
    node build/cli.js
    ```

2.  **Server-Sent Events (SSE) Mode:** Communicates over HTTP using SSE.
    ```bash
    npm install
    npm run build
    node build/server.js
    ```
    The SSE endpoint will be available at `http://localhost:8080/mcp` by default. You can configure the port using the `NODE_PORT` environment variable (e.g., `NODE_PORT=3000 node build/server.js`).

    You can test the SSE endpoint with `curl`:
    ```bash
    curl -N http://localhost:8080/mcp
    ```
    Then, in a separate terminal, you can send MCP requests (as JSON) to the server via its stdin if you are also running it in stdio mode, or by sending HTTP POST requests if you were to implement an HTTP ingress for requests. For now, the SSE transport only handles outgoing messages. For a full duplex SSE communication, the client would also need to send requests to the server (e.g. via POST requests to a different endpoint). This example focuses on the server sending events to the client.
