import type { LedGrid } from '../layout';
import type { LedStyle, SignRenderer } from './types';

/** Past 2× the LEDs look the same, and 3× phone screens would pay more than twice the fill rate for it. */
const MAX_PIXEL_RATIO = 2;

const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_frame;  // R8, texel (row, column) = brightness of that LED
uniform ivec2 u_grid;       // columns, rows
uniform float u_pitch;      // LED pitch in device px
uniform vec2 u_origin;      // top-left corner of the grid in device px
uniform float u_height;     // drawing buffer height, to flip gl_FragCoord
uniform float u_radius;
uniform float u_glow;
uniform float u_dim;
uniform vec3 u_led;
uniform vec3 u_background;

out vec4 outColor;

float level(ivec2 cell) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= u_grid.x || cell.y >= u_grid.y) return 0.0;
  return texelFetch(u_frame, cell.yx, 0).r;
}

void main() {
  vec2 p = (vec2(gl_FragCoord.x, u_height - gl_FragCoord.y) - u_origin) / u_pitch;
  vec2 corner = floor(p);
  ivec2 cell = ivec2(corner);
  vec2 local = p - corner - 0.5;
  float dist = length(local);
  float v = level(cell);

  // Antialiased disc, about one device pixel of soft edge, with a hot core when glowing.
  float edge = 0.7 / u_pitch;
  float inGrid = float(cell.x >= 0 && cell.y >= 0 && cell.x < u_grid.x && cell.y < u_grid.y);
  float disc = inGrid * (1.0 - smoothstep(u_radius - edge, u_radius + edge, dist));
  vec3 lamp = u_led * mix(u_dim, 1.0, v);
  lamp = mix(lamp, vec3(1.0), u_glow * v * 0.35 * (1.0 - smoothstep(0.0, u_radius, dist)));
  vec3 color = mix(u_background, lamp, disc);

  // Halo from this LED and its neighbours. It fades out within 1.5 pitches, so the 3x3 block covers it exactly.
  if (u_glow > 0.0) {
    float halo = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        float n = level(cell + ivec2(dx, dy));
        if (n == 0.0) continue;
        float fade = max(0.0, 1.0 - length(local - vec2(dx, dy)) / 1.5);
        halo += n * fade * fade;
      }
    }
    color += u_led * halo * u_glow * 0.5;
  }

  outColor = vec4(min(color, vec3(1.0)), 1.0);
}`;

const UNIFORMS = [
  'u_frame',
  'u_grid',
  'u_pitch',
  'u_origin',
  'u_height',
  'u_radius',
  'u_glow',
  'u_dim',
  'u_led',
  'u_background',
] as const;

/**
 * The whole sign is one triangle: the fragment shader finds which LED a pixel belongs to and reads its
 * brightness from a tiny cols×rows texture. Per frame the CPU uploads that texture and makes one draw call,
 * so the cost does not grow with the number of LEDs.
 */
export class WebGLRenderer implements SignRenderer {
  readonly name = 'webgl';
  readonly supportsGlow = true;
  private readonly canvas = document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly onRestore: () => void;
  private uniforms = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private texture: WebGLTexture | null = null;
  private width = 1;
  private height = 1;
  private grid: LedGrid | null = null;
  private style: LedStyle | null = null;
  private lost = false;

  /** `onRestore` runs after the browser gives back a lost context (common when a phone backgrounds the app). */
  constructor(container: HTMLElement, onRestore: () => void) {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.onRestore = onRestore;
    this.setup();
    this.canvas.addEventListener('webglcontextlost', this.handleLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored);
    container.append(this.canvas);
  }

  resize(width: number, height: number, grid: LedGrid): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.width = width;
    this.height = height;
    this.grid = grid;
    if (!this.lost) this.applyGrid();
  }

  setStyle(style: LedStyle): void {
    this.style = style;
    if (!this.lost) this.applyStyle();
  }

  draw(frame: Uint8Array): void {
    const { gl, grid } = this;
    if (this.lost || !grid) return;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.rows, grid.cols, gl.RED, gl.UNSIGNED_BYTE, frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setup(): void {
    const gl = this.gl;
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('createShader failed');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);

    // One triangle larger than the viewport covers every pixel.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    gl.uniform1i(this.uniforms.u_frame, 0);
    // Row count is often odd, and the default 4-byte row alignment would skew the upload.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.texture = null;
  }

  private applyGrid(): void {
    const { gl, canvas, grid, uniforms: u } = this;
    if (!grid) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2i(u.u_grid, grid.cols, grid.rows);
    gl.uniform1f(u.u_pitch, grid.pitch * (canvas.height / this.height));
    gl.uniform2f(u.u_origin, grid.offsetX * (canvas.width / this.width), 0);
    gl.uniform1f(u.u_height, canvas.height);

    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.rows, grid.cols, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  }

  private applyStyle(): void {
    const { gl, style, uniforms: u } = this;
    if (!style) return;
    gl.uniform1f(u.u_radius, style.radius);
    gl.uniform1f(u.u_glow, style.glow);
    gl.uniform1f(u.u_dim, style.dim);
    gl.uniform3f(u.u_led, ...style.led);
    gl.uniform3f(u.u_background, ...style.background);
  }

  private readonly handleLost = (event: Event): void => {
    event.preventDefault(); // tells the browser we want the context back
    this.lost = true;
  };

  private readonly handleRestored = (): void => {
    this.lost = false;
    this.setup();
    this.applyGrid();
    this.applyStyle();
    this.onRestore();
  };
}
