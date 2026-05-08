"use client"

import { useCallback, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useRouter } from "next/navigation"
import { ArrowLeft, Play, Save, Zap, CheckCircle2, XCircle, SkipForward, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkflowGraph, WorkflowNode } from "@voxly/types"
import { TriggerNode } from "./nodes/trigger-node"
import { FilterNode } from "./nodes/filter-node"
import { EnrichNode } from "./nodes/enrich-node"
import { ActionNode } from "./nodes/action-node"
import { NodePalette } from "./node-palette"
import { NodeEditor } from "./node-editor"

const NODE_TYPES = {
  trigger: TriggerNode,
  filter:  FilterNode,
  enrich:  EnrichNode,
  action:  ActionNode,
}

type TestStepResult = "pass" | "fail" | "skip"
type TestResults = Record<string, { nodeType: string; result: TestStepResult; detail?: unknown }>

interface WorkflowBuilderProps {
  workflow: { id: string; name: string; isActive: boolean; graphJson: object }
  workspaceId: string
  members: Array<{ id: string; clerkUserId: string; role: string }>
  recentFeedback: Array<{ id: string; label: string; sourceType: string }>
}

function graphToFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }))
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "hsl(var(--primary))", strokeOpacity: 0.6 },
  }))
  return { nodes, edges }
}

export function WorkflowBuilder({ workflow, workspaceId, members, recentFeedback }: WorkflowBuilderProps) {
  const router = useRouter()
  const initialGraph = workflow.graphJson as WorkflowGraph

  const [nodes, setNodes, onNodesChange] = useNodesState(graphToFlow(initialGraph).nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphToFlow(initialGraph).edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [name, setName] = useState(workflow.name)
  const [isActive, setIsActive] = useState(workflow.isActive)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [testRunItemId, setTestRunItemId] = useState(recentFeedback[0]?.id ?? "")
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [showTestPanel, setShowTestPanel] = useState(false)

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, style: { stroke: "hsl(var(--primary))", strokeOpacity: 0.6 } },
          eds,
        ),
      )
      setDirty(true)
    },
    [setEdges],
  )

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  function addNode(type: WorkflowNode["type"]) {
    const id = `${type}-${Date.now()}`
    const defaults: Record<WorkflowNode["type"], object> = {
      trigger: { trigger: "new_feedback", config: {} },
      filter:  { logic: "AND", clauses: [] },
      enrich:  { enrichments: [] },
      action:  { action: "assign", config: {} },
    }
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 80, y: 200 + Math.random() * 80 },
      data: defaults[type] as Record<string, unknown>,
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(id)
    setDirty(true)
  }

  function updateNodeData(nodeId: string, data: Record<string, unknown>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as Record<string, unknown>), ...data } } : n)),
    )
    setDirty(true)
  }

  function deleteNode(nodeId: string) {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setDirty(true)
  }

  function buildGraph(): WorkflowGraph {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as WorkflowNode["type"],
        position: n.position as { x: number; y: number },
        data: n.data as WorkflowNode["data"],
      })) as unknown as WorkflowNode[],
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }
  }

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/workflows/${workflow.id}?workspaceId=${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isActive, graphJson: buildGraph() }),
      })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    if (!testRunItemId) return
    setTesting(true)
    setTestResults(null)
    try {
      // Save first so the worker picks up the latest graph
      await save()
      const res = await fetch(`/api/workflows/${workflow.id}/test-run?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackItemId: testRunItemId }),
      })
      if (!res.ok) throw new Error("Test run failed")
      // Poll for result (simplified: wait 3s then re-fetch runs)
      await new Promise((r) => setTimeout(r, 3000))
      const runsRes = await fetch(`/api/workflows/${workflow.id}/runs?workspaceId=${workspaceId}`)
      if (runsRes.ok) {
        const runs = (await runsRes.json()) as Array<{ stepsJson: TestResults | null }>
        const latest = runs[0]
        if (latest?.stepsJson) setTestResults(latest.stepsJson)
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
        <button
          onClick={() => router.push("/dashboard/workflows")}
          className="flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
          className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          placeholder="Workflow name"
        />

        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}

        {/* Active toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-muted-foreground">Active</span>
          <button
            role="switch"
            aria-checked={isActive}
            onClick={() => { setIsActive((a) => !a); setDirty(true) }}
            className={cn(
              "relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors",
              isActive ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                isActive ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </label>

        <button
          onClick={() => setShowTestPanel((s) => !s)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Play className="h-3.5 w-3.5" />
          Test run
        </button>

        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <NodePalette onAdd={addNode} />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => { onNodesChange(changes); setDirty(true) }}
            onEdgesChange={(changes) => { onEdgesChange(changes); setDirty(true) }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "hsl(var(--primary))", strokeOpacity: 0.6 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
            <Controls className="border border-border bg-card shadow-sm rounded-md" />
            <MiniMap className="border border-border bg-card rounded-md" />

            {/* Test result overlay badges */}
            {testResults && (
              <Panel position="top-center">
                <div className="flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 shadow-sm text-xs">
                  {Object.entries(testResults).map(([id, step]) => (
                    <span key={id} title={`${id}: ${step.result}`}>
                      {step.result === "pass"
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                        : step.result === "fail"
                        ? <XCircle className="h-4 w-4 text-red-500 inline" />
                        : <SkipForward className="h-4 w-4 text-muted-foreground inline" />}
                    </span>
                  ))}
                  <span className="ml-1 text-muted-foreground">
                    {Object.values(testResults).filter((s) => s.result === "pass").length}/
                    {Object.values(testResults).length} passed
                  </span>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Node editor (right panel) */}
        {selectedNode && (
          <NodeEditor
            node={selectedNode}
            members={members}
            onUpdate={(data) => updateNodeData(selectedNode.id, data)}
            onDelete={() => deleteNode(selectedNode.id)}
            testResult={testResults?.[selectedNode.id] ?? null}
          />
        )}

        {/* Test run panel (when no node selected) */}
        {showTestPanel && !selectedNode && (
          <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-primary" />
                Test run
              </div>
              <button
                onClick={() => setShowTestPanel(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Feedback item</label>
                <select
                  value={testRunItemId}
                  onChange={(e) => setTestRunItemId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
                >
                  {recentFeedback.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label.slice(0, 50)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runTest}
                disabled={testing || !testRunItemId}
                className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {testing ? "Running…" : "Run test"}
              </button>

              {testResults && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Results</p>
                  {Object.entries(testResults).map(([id, step]) => (
                    <div key={id} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
                      {step.result === "pass"
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : step.result === "fail"
                        ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        : <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="font-medium capitalize">{step.nodeType}</span>
                      <span className="ml-auto text-muted-foreground capitalize">{step.result}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
