import { describe, expect, it } from "vitest";
import { diagramToBpmnXml, waypoints } from "../model/bpmn-xml";
import { EMPTY_DIAGRAM, type BpmnDiagram } from "../model/diagram";
import { addPool, addShape, connect } from "../model/edit";
import { diagramSvg, escapeXml, wrapText } from "../model/svg";
import { fileName } from "../components/export";

const names = { pool: "Shop & Co", lane: (n: number) => (n === 1 ? "Sales" : "Stores") };

function order(): BpmnDiagram {
  let d = addPool(EMPTY_DIAGRAM, { x: 0, y: 0 }, { pool: "p1", lanes: ["l1", "l2"] }, names);
  d = addShape(d, "startEvent", { x: 100, y: 80 }, "start");
  d = addShape(d, "exclusiveGateway", { x: 250, y: 80 }, "gate", "In stock?");
  d = addShape(d, "userTask", { x: 450, y: 240 }, "pick", "Pick <items>");
  d = addShape(d, "dataStore", { x: 450, y: 80 }, "stock");
  d = addShape(d, "endEvent", { x: 1000, y: 80 }, "outside");
  const flow = { sourceSide: "right" as const, targetSide: "left" as const };
  d = connect(d, { id: "f1", kind: "sequence", source: "start", target: "gate", ...flow });
  d = connect(d, {
    id: "f2",
    kind: "default",
    source: "gate",
    target: "pick",
    label: "yes & go",
    sourceSide: "bottom",
    targetSide: "left",
  });
  d = connect(d, {
    id: "f3",
    kind: "association",
    source: "pick",
    target: "stock",
    sourceSide: "top",
    targetSide: "bottom",
  });
  d = connect(d, { id: "f4", kind: "message", source: "pick", target: "outside", ...flow });
  return d;
}

describe("SVG export", () => {
  it("escapes every text a user typed", () => {
    const { svg } = diagramSvg(order());
    expect(svg).toContain("Pick &lt;items&gt;");
    expect(svg).toContain("Shop &amp; Co");
    expect(svg).toContain("yes &amp; go");
    expect(svg).not.toContain("<items>");
  });

  it("draws every pool, lane, shape and connector inside a margin", () => {
    const { svg, width, height } = diagramSvg(order());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('marker-end="url(#bpmn-arrow)"');
    expect(svg).toContain('stroke-dasharray="7 5"');
    expect(svg).toContain(">Stores<");
    expect(width).toBe(1020 + 80);
    expect(height).toBe(320 + 80);
  });

  it("gives an empty diagram a small blank page", () => {
    const { width, height } = diagramSvg(EMPTY_DIAGRAM);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("wraps at spaces and splits a word longer than a line", () => {
    expect(wrapText("one two three", 7)).toEqual(["one two", "three"]);
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapText("a\nb", 10)).toEqual(["a", "b"]);
  });

  it("escapes the five XML characters", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
    );
  });
});

describe("BPMN XML export", () => {
  const xml = diagramToBpmnXml(order(), "Order <1>");

  it("makes each pool a participant with its own process and lanes", () => {
    expect(xml).toContain(
      '<bpmn:participant id="Participant_p1" name="Shop &amp; Co" processRef="Process_p1"/>',
    );
    expect(xml).toContain(
      '<bpmn:lane id="l1" name="Sales"><bpmn:flowNodeRef>start</bpmn:flowNodeRef><bpmn:flowNodeRef>gate</bpmn:flowNodeRef></bpmn:lane>',
    );
    expect(xml).toContain(
      '<bpmn:lane id="l2" name="Stores"><bpmn:flowNodeRef>pick</bpmn:flowNodeRef></bpmn:lane>',
    );
    expect(xml).toContain('<bpmn:process id="Process_main"');
  });

  it("gives the shapes outside every pool a participant of their own", () => {
    expect(xml).toContain('<bpmn:participant id="Participant_main" processRef="Process_main"/>');
    const participants = xml.match(/<bpmn:participant /g) ?? [];
    const processes = xml.match(/<bpmn:process /g) ?? [];
    expect(participants).toHaveLength(processes.length);
  });

  it("writes symbols with their names, defaults and event types", () => {
    expect(xml).toContain('<bpmn:exclusiveGateway id="gate" name="In stock?" default="f2"/>');
    expect(xml).toContain('<bpmn:userTask id="pick" name="Pick &lt;items&gt;"/>');
    expect(xml).toContain('<bpmn:dataStoreReference id="stock"/>');
    expect(xml).toContain('<bpmn:startEvent id="start"/>');
  });

  it("puts sequence flows in their process and message flows in the collaboration", () => {
    expect(xml).toContain(
      '<bpmn:sequenceFlow id="f2" name="yes &amp; go" sourceRef="gate" targetRef="pick"/>',
    );
    expect(xml).toContain('<bpmn:association id="f3" sourceRef="pick" targetRef="stock"/>');
    const collaboration = xml.slice(
      xml.indexOf("<bpmn:collaboration"),
      xml.indexOf("</bpmn:collaboration>"),
    );
    expect(collaboration).toContain(
      '<bpmn:messageFlow id="f4" sourceRef="pick" targetRef="outside"/>',
    );
    expect(xml).toContain('name="Order &lt;1&gt;"');
  });

  it("never lets a sequence flow leave its process", () => {
    const flow = { sourceSide: "right" as const, targetSide: "left" as const };
    let d = connect(order(), {
      id: "f5",
      kind: "sequence",
      source: "start",
      target: "outside",
      ...flow,
    });
    d = connect(d, { id: "f6", kind: "default", source: "start", target: "outside", ...flow });
    d = connect(d, { id: "f7", kind: "association", source: "outside", target: "stock", ...flow });
    const out = diagramToBpmnXml(d, "Order");
    const collaboration = out.slice(
      out.indexOf("<bpmn:collaboration"),
      out.indexOf("</bpmn:collaboration>"),
    );
    expect(collaboration).toContain(
      '<bpmn:messageFlow id="f5" sourceRef="start" targetRef="outside"/>',
    );
    expect(collaboration).toContain(
      '<bpmn:messageFlow id="f6" sourceRef="start" targetRef="outside"/>',
    );
    expect(collaboration).toContain(
      '<bpmn:association id="f7" sourceRef="outside" targetRef="stock"/>',
    );
    expect(collaboration.indexOf("messageFlow")).toBeLessThan(collaboration.indexOf("association"));
    expect(out).not.toContain('<bpmn:sequenceFlow id="f5"');
    expect(out).toContain('<bpmn:startEvent id="start"/>');
  });

  it("lays every element out in DI", () => {
    expect(xml).toContain(
      '<bpmndi:BPMNShape id="Participant_p1_di" bpmnElement="Participant_p1" isHorizontal="true"><dc:Bounds x="0" y="0" width="720" height="320"/>',
    );
    expect(xml).toContain('<bpmndi:BPMNEdge id="f1_di" bpmnElement="f1">');
    expect(xml.match(/<bpmndi:BPMNShape /g)).toHaveLength(1 + 2 + 5);
  });

  it("routes connectors with right angles", () => {
    const d = order();
    const route = waypoints(
      d,
      d.flows.find((f) => f.id === "f2")!,
    );
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1]!, route[i]!];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it("uses one process and no collaboration without pools", () => {
    const solo = diagramToBpmnXml(addShape(EMPTY_DIAGRAM, "task", { x: 0, y: 0 }, "t1"), "Solo");
    expect(solo).not.toContain("bpmn:collaboration");
    expect(solo).toContain('bpmnElement="Process_main"');
  });
});

describe("export file names", () => {
  it("removes characters Windows refuses and falls back to a default", () => {
    expect(fileName('Order: "flow" / v2?')).toBe("Order- -flow- - v2-");
    expect(fileName("   ")).toBe("diagram");
    expect(fileName("a\u0007b")).toBe("ab");
  });
});
