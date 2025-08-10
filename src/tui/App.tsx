import React, { useState, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { AgentRunner } from "@/agent/core";

export default function App() {
  const { exit } = useApp();
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const agent = useMemo(() => new AgentRunner(), []);

  useInput((inputKey, key) => {
    if (key.escape) exit();
  });

  const submit = async () => {
    if (!input.trim() || busy) return;
    const goal = input.trim();
    setHistory((h) => [...h, { role: "user", content: goal }]);
    setInput("");
    setBusy(true);
    try {
      const answer = await agent.run(goal);
      setHistory((h) => [...h, { role: "assistant", content: answer }]);
    } catch (e) {
      setHistory((h) => [...h, { role: "assistant", content: `Error: ${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" padding={1} flexDirection="column">
        {history.map((m, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={m.role === "user" ? "cyan" : "green"}>
              {m.role === "user" ? "You" : "Agent"}:
            </Text>
            <Text> {m.content}</Text>
          </Box>
        ))}
        {busy && (
          <Text color="yellow">Thinking...</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Enter a goal and press Enter. Press Esc to quit.</Text>
      </Box>
      <Box>
        <TextInput
          placeholder="e.g., compute (23+19)^2 using calculator"
          value={input}
          onChange={setInput}
          onSubmit={submit}
        />
      </Box>
    </Box>
  );
}
