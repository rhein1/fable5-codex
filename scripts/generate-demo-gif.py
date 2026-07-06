from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "plugins" / "fable5-codex" / "assets" / "fable5-demo.gif"

W, H = 1280, 720
BG = "#0B1020"
PANEL = "#151B2E"
ORANGE = "#E8613A"
BLUE = "#9CC7FF"
MUTED = "#AAB6C5"
WHITE = "#F8FAFC"
GREEN = "#86EFAC"


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


TITLE = font(54, True)
SUB = font(28)
BODY = font(25)
MONO = font(24)
SMALL = font(21)


def rounded(draw, box, fill, outline=None, width=2, radius=22):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_lines(draw, lines, x, y, fill=WHITE, spacing=12, fnt=BODY):
    for line in lines:
        draw.text((x, y), line, fill=fill, font=fnt)
        y += fnt.size + spacing
    return y


def base(title, subtitle):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, W, 12), fill=ORANGE)
    draw.text((72, 58), title, fill=WHITE, font=TITLE)
    draw.text((76, 126), subtitle, fill=MUTED, font=SUB)
    draw.rounded_rectangle((1050, 56, 1195, 104), radius=18, fill="#20283C")
    draw.text((1080, 68), "Fable-5", fill=BLUE, font=SMALL)
    return img, draw


def code_panel(draw, lines, x=86, y=210, w=1108, h=250):
    rounded(draw, (x, y, x + w, y + h), "#080B14", outline="#283044", radius=24)
    py = y + 36
    for line in lines:
        draw.text((x + 36, py), line, fill=GREEN if line.startswith(">") else WHITE, font=MONO)
        py += 40


def flow_cards(draw, cards):
    x = 90
    y = 238
    for i, (head, body, color) in enumerate(cards):
        rounded(draw, (x, y, x + 260, y + 200), PANEL, outline=color, radius=24)
        draw.text((x + 28, y + 28), head, fill=color, font=SUB)
        draw_lines(draw, body, x + 28, y + 82, fill=WHITE, spacing=8, fnt=SMALL)
        if i < len(cards) - 1:
            draw.line((x + 270, y + 100, x + 318, y + 100), fill=MUTED, width=4)
            draw.polygon([(x + 318, y + 100), (x + 304, y + 91), (x + 304, y + 109)], fill=MUTED)
        x += 320


frames = []

img, draw = base("Install in one command", "npm install path plus GitHub fallback for pinned testing.")
code_panel(draw, [
    "> npx fable5-codex",
    "> codex plugin add fable5-codex@personal",
    "> start a new Codex thread",
])
draw.text((90, 540), "Fallback: npx github:rhein1/fable5-codex", fill=MUTED, font=BODY)
frames.append(img)

img, draw = base("Call a Fable skill", "Use the skill directly or let Codex match the task.")
code_panel(draw, [
    "Use $fable-audit. Scope: this repository.",
    "Focus: correctness, security, data, operations, tests, docs-vs-reality.",
    "Include a Workflow Trace.",
])
frames.append(img)

img, draw = base("ECF run contract", "Scope, authority, evidence, verification, and receipt are explicit.")
flow_cards(draw, [
    ("Scope", ["target paths", "task focus", "risk level"], BLUE),
    ("Authority", ["read-only default", "main owns side effects", "redact secrets"], ORANGE),
    ("Evidence", ["source paths", "commands", "unknowns kept"], GREEN),
    ("Receipt", ["mode", "lenses", "coverage gaps"], "#FACC15"),
])
frames.append(img)

img, draw = base("Large tasks can fan out", "When explicitly authorized and runtime-supported, lenses become real subagents.")
flow_cards(draw, [
    ("Correctness", ["edge cases", "integration", "contracts"], BLUE),
    ("Security", ["auth", "privacy", "secrets"], ORANGE),
    ("Data", ["migrations", "idempotency", "state"], GREEN),
    ("Ops", ["tests", "startup", "docs"], "#FACC15"),
])
frames.append(img)

img, draw = base("Workflow Trace", "Reports say what actually happened, not what was hoped.")
code_panel(draw, [
    "mode: multi-agent | single-agent multi-lens",
    "subagent tool: available | unavailable",
    "spawned agents: real IDs only",
    "coverage gaps: preserved",
], h=300)
frames.append(img)

img, draw = base("Findings first", "Issues need evidence, failure scenario, refutation, and safest next step.")
rounded(draw, (90, 220, 1190, 510), PANEL, outline=ORANGE, radius=24)
draw_lines(draw, [
    "High: duplicate retries are not idempotent.",
    "Evidence: src/paymentAttempts.js stores every call.",
    "Failure scenario: retry creates duplicate paid attempts.",
    "Safest next step: define retry key and add duplicate tests.",
], 130, 260, fill=WHITE, spacing=20, fnt=BODY)
frames.append(img)

img, draw = base("Measured workflow lift", "Tiny benchmark fixtures show output discipline, not broad model quality.")
rounded(draw, (110, 250, 560, 510), PANEL, outline=MUTED, radius=24)
rounded(draw, (720, 250, 1170, 510), PANEL, outline=ORANGE, radius=24)
draw.text((180, 300), "Normal gpt-5.5", fill=MUTED, font=SUB)
draw.text((250, 370), "93.3", fill=WHITE, font=font(76, True))
draw.text((790, 300), "gpt-5.5 + Fable-5", fill=ORANGE, font=SUB)
draw.text((862, 370), "98.7", fill=WHITE, font=font(76, True))
draw.text((533, 598), "+5.3 pts", fill=GREEN, font=font(44, True))
frames.append(img)

img, draw = base("Fable-5 for Codex", "Evidence-first multi-pass workflows for serious codebase work.")
code_panel(draw, [
    "> npx fable5-codex",
    "> Use $fable-audit with an ECF run contract.",
    "> Include findings, rejected candidates, unknowns, and Workflow Trace.",
], h=260)
draw.text((90, 560), "https://github.com/rhein1/fable5-codex", fill=BLUE, font=BODY)
frames.append(img)

OUT.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=1150,
    loop=0,
    optimize=True,
)
print(f"wrote {OUT}")
