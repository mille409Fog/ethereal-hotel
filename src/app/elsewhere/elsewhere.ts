import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The home page's one picture of Hôtel Aubade, and the way in.
 *
 * It sits between two sections rather than in one, and has no `id` and no nav
 * item, for the reason `footer.html` gives: Aubade is a separate work that
 * shares this deployment, and anything the nav points at is filed as a section
 * of the portfolio. That argument is about filing. This block is about being
 * seen, because a single footer line was hiding the most distinctive work here.
 *
 * Nothing here imports from `src/aubade/` — the links are plain hrefs and the
 * still is a file, so `/` fetches none of the piece's code (`check:docs` gates
 * the import direction, `e2e/aubade.spec.ts` the absent context).
 */
@Component({
  selector: 'app-elsewhere',
  templateUrl: './elsewhere.html',
  styleUrl: './elsewhere.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Elsewhere {
  /**
   * A frame `npm run verify:shader` committed to `docs/images/`, served as-is
   * by the asset entry in `angular.json` rather than copied into `public/`, so
   * re-rendering the lobby updates this picture too. The dimensions are the
   * file's own, which is what lets the browser reserve the box before it lands.
   */
  public readonly still = {
    src: '/stills/aubade-lobby-aubade.webp',
    width: 1280,
    height: 720,
    alt:
      'The lobby at civil twilight: light from the transom over the door falls across a ' +
      'chequered floor toward the reception desk, its bell, its register and a lamp, with a ' +
      'rack of key pigeonholes on the wall behind.',
  } as const;
}
