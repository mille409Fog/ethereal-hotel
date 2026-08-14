/**
 * The vertex stage: one triangle, no attributes, no buffers.
 *
 * A fullscreen *quad* needs two triangles, a vertex buffer, an index buffer and
 * a vertex array object, and it draws the pixels along its shared diagonal
 * twice — GPUs rasterise in 2×2 quads and the seam falls between them. A single
 * oversized triangle covers the same viewport with none of that: the three
 * corners are derived from `gl_VertexID`, so there is no buffer to allocate, no
 * VAO to bind and nothing to upload. `drawArrays(TRIANGLES, 0, 3)` is the entire
 * draw call.
 *
 * The corners come out as (-1,-1), (3,-1) and (-1,3): a triangle twice the size
 * of clip space, clipped by the hardware to exactly the viewport. The waste is
 * imaginary — clipped area is never rasterised.
 *
 * `gl_VertexID` is the reason this needs WebGL2. GLSL ES 1.00 has no such
 * built-in, and the WebGL1 version of this file is fifty lines of buffer
 * management to achieve the same three points.
 */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es

void main() {
  // vertex 0 -> (0,0), vertex 1 -> (2,0), vertex 2 -> (0,2), then to clip space.
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
