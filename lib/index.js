/**
 * dsh-work-buddy -- host half.
 *
 * The buddy is a pure browser surface, so the host half only has to exist for
 * the loader row to mount; the browser half ships as this package's `./client`
 * export and is discovered through the `dsh.client` declaration.
 *
 * @module dsh-work-buddy
 */

export const name = 'dsh-work-buddy'

/** No host services: the widget obeys the page, not the process. */
export const inject = []

export function apply() {}