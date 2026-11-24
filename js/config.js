/*
 * The one place for things that will change.
 *
 * gameName       The game's name. Change it here and it changes in the browser
 *                tab, the heading and every sentence. The first word is set big
 *                in the wordmark and the rest goes under the line.
 * nameIsFinal    false puts a "Working title" label over the name.
 * signupEndpoint The address that receives sign-ups: the Buttondown list with
 *                the username realmsunderfoot. The same address is written as
 *                the form's action in index.html, so the form also works with
 *                JavaScript off; change both together. Set this to null and the
 *                form sends nothing and tells the visitor so.
 *                Buttondown takes an ordinary form post: field "email", hidden
 *                "embed" = 1, and extra fields named metadata__<key>
 *                (docs.buttondown.com/building-your-subscriber-base, read
 *                23 November 2026). Each key (first-name, city, phone) needs a
 *                custom input with that key in Buttondown's subscribing settings.
 * soundAvailable true shows the Sound switch. Sound still starts off, and no clip is
 *                fetched until the visitor turns it on. false hides the switch, and
 *                tools/build_public.py then leaves assets/audio/ out of the public copy.
 */
window.SITE = {
  gameName: "Realms Underfoot",
  nameIsFinal: true,
  signupEndpoint: "https://buttondown.com/api/emails/embed-subscribe/realmsunderfoot",
  soundAvailable: true,
  updatesUrl: "data/updates.json",
};
