/*
 * What the goblins say, and when.
 *
 * T is the rock thrower (skinny, jumpy, hungry, nosy). B is the bruiser (flat, literal, dutiful).
 * Each entry under a trigger is one "bit": a list of [who, words, clip]. The clip is optional and
 * names a file in assets/audio/ recorded for the game; it is used only where the game's own line
 * fits word for word. New lines have no voice. A trigger never repeats a bit until it has used
 * every bit it has.
 */

export const NAMES = { T: "Rock thrower", B: "Bruiser" };

const t = (words, clip) => [["T", words, clip]];
const b = (words, clip) => [["B", words, clip]];

export const LINES = {
  // First ever visit.
  arrive: [
    [["T", "Oi. Somebody's here."], ["B", "Guard the box."]],
    t("A visitor! Quick. Look like guards."),
    t("Hello. We're not meant to talk to you. Hello."),
    t("You're early. Nothing's finished. Don't tell Boss."),
  ],
  // A second or later visit.
  comeBack: [
    t("You again."),
    t("Back already? We haven't moved. Not allowed to."),
    [["T", "Told you they'd come back."], ["B", "You said they wouldn't."]],
    t("I remember you. You poked about last time."),
    t("Second visit. Boss says that means keen. Or lost."),
  ],
  scrollFast: [
    t("Slow down! Some of us have short legs."),
    t("You're not even reading it!"),
    t("Oi! I'm on foot here!"),
    t("What's the hurry? Is something chasing you? Is it behind me?"),
    t("Nobody reads any more. I can't read either, mind."),
  ],
  scrollUp: [
    t("Forgot something?"),
    t("Back up we go. Make your mind up."),
    t("Missed a bit, did you?"),
    t("I only just got down here."),
    t("Lost something? Don't ask him. He lost the stick."),
  ],
  idle: [
    [["T", "I'm hungry.", "banter-24"], ["B", "You ate at sunrise.", "banter-25"], ["T", "That was a beetle. A beetle isn't a meal.", "banter-26"], ["B", "It is if you eat it slowly.", "banter-27"]],
    t("Still there? You've gone all still."),
    t("Are you asleep? Can I have your phone if you're asleep?"),
    t("I could stand here all day. I do stand here all day."),
    [["B", "How long until the next shift?", "banter-33"], ["T", "There is no next shift. It's just us.", "banter-34"], ["B", "Boss really doesn't like us, does he?", "banter-35"], ["T", "No.", "banter-36"]],
    [["B", "You lost the stick."], ["T", "I didn't lose it. I put it down.", "banter-02"], ["B", "Where?", "banter-03"], ["T", "By the tree.", "banter-04"], ["B", "Which tree, you idiot?", "banter-05"], ["T", "The one with the... roots.", "banter-06"]],
  ],
  sleep: [
    t("Zzz. Not the ears. Zzz."),
    t("Zzz. Slowly. Eat it slowly. Zzz."),
  ],
  wake: [
    t("Did you hear something?", "goblin-suspicious-0"),
    t("I wasn't asleep. I was guarding with my eyes shut."),
    [["B", "What was that?", "goblin-suspicious-1"], ["T", "Nothing. I was awake the whole time."]],
  ],
  hoverSignup: [
    b("Boss said guard the box. So we guard the box.", "banter-13"),
    t("And stay away from the box!", "goblin-demand"),
    b("Back off. Last warning.", "goblin-warn"),
    t("That box wants an email. Have you got one, or are you just looking?"),
    t("Go on, then. It doesn't bite. The other thing bites."),
    t("Hovering. That's what flies do."),
    [["T", "What do you reckon is in it?", "banter-18"], ["B", "In what?", "banter-19"], ["T", "The box.", "banter-20"], ["B", "Not our business. We guard it. We don't look in it.", "banter-21"]],
  ],
  typing: [
    t("Writing! Look at that. Proper letters."),
    t("Don't mind me. I'm not looking. I'm looking a bit."),
    t("Spell it right. Boss can't read either, but still."),
    t("Is that your name? Funny name."),
  ],
  typingAt: [
    t("That's the squiggle. I like the squiggle."),
    t("Ooh. A curly one."),
  ],
  deleting: [
    t("Gone. All that writing, gone."),
    t("Changed your mind? I change mine all the time. It's nearly new."),
    [["T", "Tell you what. We never saw you. You never saw us.", "ending-talked-a"], ["B", "Box? What box?", "ending-talked-b"]],
    t("Cold feet? Mine are always cold. No boots."),
    t("Rubbed it out! Was it wrong? Was it a secret?"),
  ],
  // Back from the list service after sending the form. A letter with a link to click is on its way.
  listPending: [
    t("Nearly on the list! There's a letter coming. Click the thing in it."),
    [["B", "Check your letters."], ["T", "He means your inbox. He means please."]],
    t("You pressed it! Something happened this time. Go and look in your inbox."),
  ],
  // Back after clicking the link in that letter.
  listConfirmed: [
    t("You're on the list! Boss will be pleased. Boss is never pleased, but still."),
    [["T", "Another one for the list!"], ["B", "Don't count them. You can't count."]],
    t("It's official. You're one of the ones who get told things."),
  ],
  // Only when the list has no destination (signupEndpoint is null in js/config.js).
  submitClosed: [
    t("It's not open yet! Boss hasn't said where the list goes. I'll remember your face instead."),
    [["B", "List isn't open. Come back."], ["T", "He means please."]],
    t("Not yet. Soon. Boss says soon. Boss says soon a lot."),
  ],
  submitBad: [
    t("That's not an email. Even I know that."),
    b("Wrong. Try again."),
    t("It needs the squiggle. They all need the squiggle."),
  ],
  pokeT: [
    t("Hey!", "goblin-hey-0"),
    t("Ow! What was that for?"),
    t("Not the ears! Not the ears!", "hit-skinny-1"),
    t("Okay, okay, okay! No need for that!", "reply-threaten-2"),
    t("Stop poking. I bruise. I'm not the Bruiser, but I bruise."),
    [["T", "Poke him instead! He likes it."], ["B", "Oi! Only I get to hit him!", "friend-hit-1"]],
    t("You said that already!", "reply-tired"),
  ],
  pokeB: [
    b("Hey!", "goblin-hey-1"),
    b("Right. Now I'm cross.", "hit-stocky-1"),
    b("What?", "reply-unknown-1"),
    b("Don't."),
    b("I felt that. Barely."),
    [["T", "Hit him back, you lump!", "friend-hit-0"], ["B", "Can't. Guarding."]],
  ],
  fleeT: [t("I'm not dying for a box!", "goblin-flee-0")],
  fleeB: [b("Not worth it. Not for what Boss pays.", "goblin-flee-1")],
  backFromFlee: [
    t("I wasn't running. I was checking over there."),
    t("Are you done? Say you're done."),
  ],
  tabReturn: [
    t("You went away. We noticed. We didn't move. Mostly."),
    t("Where did you go? Was there food?"),
    [["T", "Did you hear something?", "goblin-suspicious-0"], ["B", "What was that?", "goblin-suspicious-1"]],
    t("Back! Nothing happened while you were gone. Don't look at the egg."),
    t("Things move when nobody's looking, you know. Not us. Other things."),
  ],
  resize: [
    t("Who moved the walls?"),
    t("It got smaller. Did it get smaller? I feel bigger."),
    t("Stop squashing it! We live in here."),
    t("Wider. Narrower. Pick one."),
    t("Everything moved. I hate it when everything moves."),
  ],
  // Said as the visitor nears the bottom, where the dragon lands. The game's own exchange.
  omen: [
    [["T", "It's gone quiet. I don't like quiet.", "banter-28"], ["B", "Quiet is good. Quiet means nothing is eating us.", "banter-29"], ["T", "Don't say that. You'll bring Ignis down on us.", "banter-30"], ["B", "Don't say his name!", "banter-31"], ["T", "Sorry.", "banter-32"]],
  ],
  ignis: [
    [["T", "Aaah! It's Ignis! Run!", "ignis-0"], ["B", "Ignis! Forget the box! Run!", "ignis-1"]],
  ],
  afterIgnis: [
    [["T", "Is he gone?"], ["B", "Don't say his name!", "banter-31"], ["T", "I didn't!"]],
    t("We weren't hiding. We were guarding from further away."),
  ],
  soundOn: [t("Now you can hear us. Sorry about him."), [["T", "Is this thing on?"], ["B", "What?", "reply-unknown-1"]]],
  soundOff: [t("Fine. We'll mime."), t("Shh. Got it.")],
  talkOff: [t("Fine. Not another w")],
  talkOn: [t("Missed us. Knew it."), t("Where were we? Oh. Nowhere.")],
  zoneWays: [
    t("Four ways past us. None of them work. Two of them work."),
    t("They forgot running away. That's the fifth one. That's mine."),
  ],
  zoneVideo: [
    t("There's meant to be a moving picture there. Boss is still choosing."),
    t("Nothing to see. Really. It's a rectangle."),
  ],
  zoneUpdates: [
    t("Big secrets. We know all of them. We've forgotten most of them."),
    t("Hush hush, Boss says. So we're hushing. This is us hushing."),
  ],
  zoneFeeds: [
    t("Locked. Don't ask us. We do boxes, not chests."),
    t("Not ours, that chest. Hers. We don't go near it."),
  ],
  waySneak: [t("We'd see you. Probably. If we were looking.")],
  wayTalk: [t("Speak up! Or speak goblin!", "reply-unknown-0")],
  wayFight: [b("With what? All you've got is our stick.", "reply-bribe")],
  wayThink: [b("I don't get it.", "reply-joke-a")],
  egg: [
    t("That egg was further off before. Wasn't it?"),
    t("Don't look at the egg. No. Do. Keep looking at it."),
    t("It moved again. I didn't see it. That's the problem."),
  ],
  keyboard: [t("No pointing? You do it with the buttons. Clever.")],
  copy: [t("Taking the words home? The words are free.")],
  stare: [t("What are you looking at?"), t("Yes? Can I help? I can't help.")],
  noWebgl: [t("You can't see us. We're in the bushes. It's better this way.")],
};

// The line under YOU DIED, from the game's own list for this ending.
export const DEATH_LINES = [
  "There was nothing you could have done. That's the joke.",
  "Ignis says thanks for the snack.",
  "You brought a stick to a dragon fight.",
  "The box was bait. You were lunch.",
  "Chewed, not stirred.",
  "You were delicious. Probably.",
  "Dragons: still undefeated.",
  "At least it was quick. For the dragon.",
  "Swallowed whole. Mostly.",
  "On the bright side, no more emails.",
];
