/* Fishes — tiers, species, zones and settings.
   Plain script, no build step. Real fish are the inspiration; sizes are game
   sizes (1 = a baby fish, 100 = the largest fish ever).

   20 tiers (one per level). Each tier has several species. The first species
   listed for a tier is the form the player evolves into on reaching it.

   temper:
     docile      never attacks, never locks on, flees bigger fish
     wary        hunts smaller fish, ignores you when you are smaller, flees when you are bigger
     aggressive  hunts smaller fish and locks on to you when you are smaller
   kind (movement):
     food        plankton and krill, drift and get eaten
     prey        small fish that flee bigger fish; some school
     ambush      sits near a spot and lunges
     hunter      roams and chases
     harmless    drifts; never attacks (v0.11: jellyfish sting on contact; crabs stay on the seabed)
   shape: round | slim | torpedo | puff | lantern | eel | lure | krill | plankton | oar | whale | jelly | turtle | crab | trash (v0.11)
          | clam | rock | shrimp | urchin | boat | squid | sub (v0.12 background items)
   bg: true   a background item (v0.12): on or off in Settings → Background items
   surf: true sits on the surface (boats); bed: true stays on the seabed
*/
(function () {
  'use strict';

  var SPECIES = [
    // Tier 1 — Sunny Cove
    { id: 'guppy', name: 'Guppy', tier: 1, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.55, size: 0.8, speed: 85, col: '#ffd96e', fin: '#ff9fbe', school: true,
      real: 'Guppy: small, bright, live-bearing freshwater fish.' },
    { id: 'neon', name: 'Neon tetra', tier: 1, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.32, size: 0.9, speed: 90, col: '#7cc3ff', stripe: '#ff6f8e', tail: '#b5e0ff', school: true,
      real: 'Neon tetra: a glowing blue stripe over a red one.' },
    { id: 'zebrafish', name: 'Zebrafish', tier: 1, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.4, size: 1.2, speed: 90, col: '#e8e8e8', stripe: '#2f5fd0', school: true,
      real: 'Zebrafish: striped, lively shoaling fish from streams in South Asia.' },
    { id: 'plankton', name: 'Plankton', tier: 1, kind: 'food', temper: 'docile', shape: 'plankton', size: 0.25, speed: 14, col: '#fff3b0', base: 70,
      real: 'Copepods and other drifting animals. Most of the sea starts here.' },

    // v0.11 creatures: scenery and a hazard. They never hunt. Spawned a few per level (see fillCreatures in game.js).
    { id: 'turtle', name: 'Green sea turtle', tier: 1, kind: 'harmless', temper: 'docile', shape: 'turtle', hr: 0.6, size: 4, speed: 28, col: '#6f9a4e', fin: '#4f7a36', belly: '#e8e0b0',
      real: 'Green sea turtle: grazes sea grass and comes up to breathe.' },
    { id: 'crab', name: 'Rock crab', tier: 1, kind: 'harmless', temper: 'docile', shape: 'crab', hr: 0.5, size: 1.6, speed: 22, col: '#c96b4a', fin: '#a7513a', bed: true,
      real: 'Rock crab: walks sideways over the seabed and hides under rocks and kelp.' },

    // Tier 3 — Rock Pool Edge
    { id: 'wrasse', name: 'Cleaner wrasse', tier: 3, kind: 'prey', temper: 'wary', shape: 'slim', hr: 0.36, size: 2.0, speed: 110, col: '#ffd34d', tail: '#ffd34d', stripe: '#2d6fd0', school: true,
      real: 'Cleaner wrasse: picks parasites off bigger fish, and is usually left alone.' },
    { id: 'herring', name: 'Herring', tier: 3, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.3, size: 2.4, speed: 95, col: '#c4d9ef', fin: '#a7c4e0', school: true,
      real: 'Herring: huge shoals keep predators busy.' },
    { id: 'sardine', name: 'Sardine', tier: 3, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.3, size: 2.2, speed: 95, col: '#9fb8d8', school: true,
      real: 'Sardine: a small schooling fish that filter-feeds on plankton.' },
    { id: 'hawkfish', name: 'Hawkfish', tier: 3, kind: 'hunter', temper: 'wary', shape: 'round', hr: 0.5, size: 2.8, speed: 90, col: '#d9573f', fin: '#c04a33',
      real: 'Hawkfish: perches on coral and drops on small fish.' },

    // v0.11 trash (family setting, Settings → Trash in the sea). It drifts and costs health when touched. You cannot eat it.
    // Turned off, the sea is clean: the trash is removed (see fillCreatures in game.js).
    { id: 'sock', name: 'Old sock', tier: 1, kind: 'harmless', temper: 'docile', shape: 'trash', trashKind: 'sock', hr: 0.3, size: 1.8, speed: 8, col: '#c7d36b', fin: '#8f9a3e', sting: true, trash: true,
      real: 'A sock that does not belong in the ocean.' },
    { id: 'underwear', name: 'Underwear', tier: 1, kind: 'harmless', temper: 'docile', shape: 'trash', trashKind: 'underwear', hr: 0.3, size: 2, speed: 8, col: '#f2a7c3', fin: '#c97a9b', sting: true, trash: true,
      real: 'Underwear, floating where it should not be.' },
    { id: 'toycar', name: 'Toy car', tier: 1, kind: 'harmless', temper: 'docile', shape: 'trash', trashKind: 'toycar', hr: 0.4, size: 4.8, speed: 8, col: '#e64b3c', fin: '#333a44', sting: true, trash: true,
      real: 'A plastic toy car.' },
    { id: 'bottle', name: 'Plastic bottle', tier: 1, kind: 'harmless', temper: 'docile', shape: 'trash', trashKind: 'bottle', hr: 0.3, size: 2.2, speed: 6, col: '#bfe6ff', fin: '#7fb8e0', sting: true, trash: true,
      real: 'A plastic bottle.' },

    // Tier 2 — Sea-grass Flats
    { id: 'clownfish', name: 'Clownfish', tier: 2, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.6, size: 1.6, speed: 70, col: '#ff9d5c', fin: '#ff9d5c', bands: [-0.35, 0.4], bandCol: '#ffffff',
      real: 'Clownfish: lives among sea anemone tentacles, shielded by their sting.' },
    { id: 'goby', name: 'Goby', tier: 2, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.45, size: 1.1, speed: 75, col: '#c9a46b', fin: '#e0c08a',
      real: 'Goby: small bottom-dwelling fish that sit on the sand.' },
    { id: 'blenny', name: 'Blenny', tier: 2, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.42, size: 1.3, speed: 60, col: '#8fb36b', fin: '#6f9150',
      real: 'Blenny: a bold little fish that peeks out of crevices.' },
    { id: 'dottyback', name: 'Dottyback', tier: 2, kind: 'hunter', temper: 'wary', shape: 'round', hr: 0.5, size: 2.0, speed: 100, col: '#b06bd6', fin: '#8e4fb8',
      real: 'Dottyback: a small, feisty reef fish that chases off rivals.' },
    { id: 'krill', name: 'Krill', tier: 2, kind: 'food', temper: 'docile', shape: 'krill', hr: 0.35, size: 0.5, speed: 30, col: '#ffb3a7', base: 12,
      real: 'Shrimp-like krill, food for many fish and whales.' },

    // A jellyfish stings you when you touch it (every 1.5 s, 2 health) and cannot be eaten.
    { id: 'moon', name: 'Moon jellyfish', tier: 3, kind: 'harmless', temper: 'docile', shape: 'jelly', hr: 0.6, size: 3, speed: 18, col: '#ff8a70', fin: '#ffc1a8', sting: true,
      real: 'Moon jellyfish: drifts with the current and stings with its tentacles.' },

    // Tier 4 — Sandy Shelf
    { id: 'anchovy', name: 'Anchovy', tier: 4, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.28, size: 2.8, speed: 100, col: '#b8d8e8', school: true,
      real: 'Anchovy: tiny schooling fish, a major food for bigger fish.' },
    { id: 'pufferfish', name: 'Pufferfish', tier: 4, kind: 'prey', temper: 'docile', shape: 'puff', hr: 0.85, size: 1.4, speed: 50, col: '#ffe38f', fin: '#f2c75c', spots: true, spotCol: '#9a7a33', spiky: true,
      real: 'Pufferfish: swells with water and has spines. Poisonous to eat.' },
    { id: 'butterflyfish', name: 'Butterflyfish', tier: 4, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.6, size: 2.6, speed: 95, col: '#ffe36b', fin: '#ffd23a', bands: [-0.2, 0.5], bandCol: '#3a3a3a',
      real: 'Butterflyfish: pairs on the reef, often bright yellow with a dark eye band.' },
    { id: 'sergeant', name: 'Sergeant major', tier: 4, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.5, size: 3.0, speed: 90, col: '#f2d24b', fin: '#e8c03a', bands: [-0.3, 0.1, 0.5], bandCol: '#2a2a2a', school: true,
      real: 'Sergeant major: yellow with black bars; a noisy shoaler that guards eggs.' },
    { id: 'cardinalfish', name: 'Cardinalfish', tier: 4, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.45, size: 1.8, speed: 70, col: '#ff6f5c', fin: '#e8553e', school: true,
      real: 'Cardinalfish: red and nocturnal; shelters in groups by day.' },

    // Tier 5 — Coral Gardens
    { id: 'parrotfish', name: 'Parrotfish', tier: 5, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.5, size: 3.2, speed: 45, col: '#7fd6b0', fin: '#ffd3a1',
      real: 'Parrotfish: grinds coral with fused, beak-like teeth.' },
    { id: 'damsel', name: 'Blue damselfish', tier: 5, kind: 'prey', temper: 'wary', shape: 'round', hr: 0.55, size: 4.5, speed: 90, col: '#5aa8ff', fin: '#2d4f8a', school: true,
      real: 'Damselfish: small reef fish that guard their patch and chase off intruders.' },
    { id: 'moray', name: 'Moray eel', tier: 5, kind: 'ambush', temper: 'aggressive', shape: 'eel', size: 7, speed: 40, col: '#9db57a', range: 150,
      real: 'Moray eel: hides in crevices and lunges out.' },
    { id: 'scorpionfish', name: 'Scorpionfish', tier: 5, kind: 'ambush', temper: 'wary', shape: 'round', hr: 0.6, size: 5.0, speed: 30, col: '#b5654a', fin: '#8f4a34', spots: true, spotCol: '#e0a070', range: 130,
      real: 'Scorpionfish: camouflaged and venomous, it waits motionless for prey.' },
    { id: 'seachub', name: 'Sea chub', tier: 5, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.45, size: 3.6, speed: 80, col: '#7aa0b8', fin: '#5f8aa4', school: true,
      real: 'Sea chub: a shoaling fish that grazes on algae.' },

    // Tier 6 — Anemone Bay
    { id: 'angelfish', name: 'Angelfish', tier: 6, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.9, size: 4, speed: 60, col: '#ffd98f', fin: '#ffb36b', bands: [-0.3, 0.1, 0.5], bandCol: '#5fb7ff',
      real: 'Angelfish: tall and flat, built for weaving through reefs.' },
    { id: 'tang', name: 'Blue tang', tier: 6, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.6, size: 3.4, speed: 130, col: '#3fa9e0', fin: '#2d8fd0', tail: '#ffd34d', school: true,
      real: 'Blue tang (the fish in Finding Nemo): darts about the reef.' },
    { id: 'lionfish', name: 'Lionfish', tier: 6, kind: 'prey', temper: 'wary', shape: 'round', hr: 0.6, size: 5.0, speed: 50, col: '#d9775a', fin: '#f0a07a', bands: [-0.4, 0, 0.4], bandCol: '#fff3e6', spiky: true,
      real: 'Lionfish: venomous spines and a slow, showy swim. Spiny to eat.' },
    { id: 'trumpetfish', name: 'Trumpetfish', tier: 6, kind: 'ambush', temper: 'wary', shape: 'slim', hr: 0.18, size: 6, speed: 60, col: '#d8b04a', fin: '#b8902e', range: 140,
      real: 'Trumpetfish: long and thin, it sneaks up behind prey.' },
    { id: 'porcupinefish', name: 'Porcupinefish', tier: 6, kind: 'prey', temper: 'docile', shape: 'puff', hr: 0.7, size: 6.5, speed: 40, col: '#e8c39a', fin: '#c9a078', spots: true, spotCol: '#5c4a33', spiky: true,
      real: 'Porcupinefish: spiny like a pufferfish, slow and calm.' },

    // Tier 7 — Reef Wall
    { id: 'mackerel', name: 'Mackerel', tier: 7, kind: 'prey', temper: 'wary', shape: 'slim', hr: 0.3, size: 6, speed: 110, col: '#4f8fb8', fin: '#7fb0d0', stripe: '#1f4f70', school: true,
      real: 'Mackerel: fast schooling fish with dark wavy lines.' },
    { id: 'triggerfish', name: 'Triggerfish', tier: 7, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.7, size: 5.5, speed: 60, col: '#7fa6c9', fin: '#5f86b8',
      real: 'Triggerfish: a locking spine on the back keeps it wedged in the reef.' },
    { id: 'bonito', name: 'Bonito', tier: 7, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.28, size: 8, speed: 170, col: '#5f86b8', fin: '#3f6a9f', sense: 240,
      real: 'Bonito: a fast, striped relative of the tuna that hunts schools.' },
    { id: 'sweetlips', name: 'Sweetlips', tier: 7, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.55, size: 7, speed: 60, col: '#f2e0c9', fin: '#e0c4a0', bands: [0.2], bandCol: '#c45a3a',
      real: 'Sweetlips: thick lips, grunts when disturbed, shelters under ledges.' },
    { id: 'snook', name: 'Snook', tier: 7, kind: 'ambush', temper: 'wary', shape: 'slim', hr: 0.32, size: 8.5, speed: 110, col: '#c7b98a', fin: '#9a8f63', stripe: '#4b5a40', range: 170,
      real: 'Snook: ambushes from mangrove roots, bursting out at passing fish.' },

    // Tier 8 — Parrot Lagoon
    { id: 'mullet', name: 'Grey mullet', tier: 8, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.3, size: 9, speed: 90, col: '#b9b3a8', fin: '#c9c4bb', school: true,
      real: 'Grey mullet: grazes on the bottom in big, calm schools.' },
    { id: 'rockfish', name: 'Rockfish', tier: 8, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.5, size: 10, speed: 40, col: '#c96b4a', fin: '#a85338', spots: true, spotCol: '#f3d4b8',
      real: 'Rockfish: a spotty fish that sits on rocks and rarely moves far.' },
    { id: 'snapper', name: 'Red snapper', tier: 8, kind: 'prey', temper: 'wary', shape: 'round', hr: 0.5, size: 11, speed: 100, col: '#ff8f7a', fin: '#ff6f5c', school: true,
      real: 'Red snapper: sturdy reef fish that travel in groups.' },
    { id: 'bluefish', name: 'Bluefish', tier: 8, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.3, size: 12, speed: 140, col: '#5f8bb8', fin: '#3e6a98', sense: 240,
      real: 'Bluefish: fast, toothy and aggressive; it attacks schools.' },
    { id: 'grouper', name: 'Grouper', tier: 8, kind: 'ambush', temper: 'wary', shape: 'round', hr: 0.6, size: 16, speed: 70, col: '#c99dd8', fin: '#b084c4', spots: true, spotCol: '#ffe2b0', range: 190,
      real: 'Grouper: sits still on the reef and ambushes passing fish.' },

    // Tier 9 — Open Blue
    { id: 'jack', name: 'Jack', tier: 9, kind: 'prey', temper: 'wary', shape: 'torpedo', hr: 0.35, size: 13, speed: 120, col: '#9fd0c8', fin: '#e4f5f1', school: true,
      real: 'Jack: a strong swimmer that moves in tight schools.' },
    { id: 'pompano', name: 'Pompano', tier: 9, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.4, size: 14, speed: 100, col: '#c8d8e0', fin: '#e8f0f4', school: true,
      real: 'Pompano: silver and graceful, shoals over sandy flats.' },
    { id: 'amberjack', name: 'Amberjack', tier: 9, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.32, size: 16, speed: 130, col: '#c9a25a', fin: '#8e6c33', sense: 220,
      real: 'Amberjack: strong and curious, it hunts in packs near the reef.' },
    { id: 'trevally', name: 'Trevally', tier: 9, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.35, size: 18, speed: 120, col: '#8fc7bd', fin: '#e4f5f1',
      real: 'Trevally: strong swimmers that chase schools of bait.' },
    { id: 'barracuda', name: 'Barracuda', tier: 9, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.26, size: 26, speed: 150, col: '#a8b7d6', fin: '#8fa0c4', stripe: '#6b7ba0', sense: 280,
      real: 'Barracuda: fast ambush hunter with a mouthful of teeth.' },

    // Tier 10 — Tuna Run
    { id: 'mahi', name: 'Mahi-mahi', tier: 10, kind: 'prey', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 15, speed: 160, col: '#ffd84d', fin: '#7ad0a0', school: true,
      real: 'Mahi-mahi: bright, fast surface swimmers that follow floating debris.' },
    { id: 'bonefish', name: 'Bonefish', tier: 10, kind: 'prey', temper: 'docile', shape: 'slim', hr: 0.25, size: 18, speed: 150, col: '#d7d0b8', fin: '#b8b096', school: true,
      real: 'Bonefish: fast flats fish, hard to catch and easily spooked.' },
    { id: 'yellowfin', name: 'Yellowfin tuna', tier: 10, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.28, size: 24, speed: 150, col: '#f0c75a', fin: '#e6a82e', sense: 260,
      real: 'Yellowfin tuna: a fast, wary open-water cruiser.' },
    { id: 'bluefin', name: 'Bluefin tuna', tier: 10, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.3, size: 32, speed: 140, col: '#7eb0e6', fin: '#ffd99c', belly: '#eef4ff', sense: 300,
      real: 'Bluefin tuna: a fast, warm-blooded cruiser.' },

    // Tier 11 — Shark Lane
    { id: 'rainbowrunner', name: 'Rainbow runner', tier: 11, kind: 'prey', temper: 'docile', shape: 'torpedo', hr: 0.32, size: 12, speed: 120, col: '#6fb9d8', fin: '#f2d66b', school: true,
      real: 'Rainbow runner: a colourful open-water fish that travels in schools.' },
    { id: 'cobia', name: 'Cobia', tier: 11, kind: 'prey', temper: 'docile', shape: 'torpedo', hr: 0.3, size: 22, speed: 110, col: '#6b4f3a', stripe: '#c9b89a',
      real: 'Cobia: a solitary, calm fish that often shadows rays and sharks.' },
    { id: 'dogtooth', name: 'Dogtooth tuna', tier: 11, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 28, speed: 140, col: '#4f7fb0', sense: 260,
      real: 'Dogtooth tuna: a heavy, wary predator of the reef edge.' },
    { id: 'sailfish', name: 'Sailfish', tier: 11, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 30, speed: 170, col: '#5d7fb8', fin: '#2f5a9a', finH: 1.8,
      real: 'Sailfish: the fastest swimmer in the ocean, with a huge sail-like fin.' },
    { id: 'reefshark', name: 'Reef shark', tier: 11, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.3, size: 38, speed: 115, col: '#bcc8d8', belly: '#fbfdff', finH: 1.6, sense: 300,
      real: 'Reef shark: patrols the reef edge.' },

    // Tier 12 — Wide Water
    { id: 'seabream', name: 'Sea bream', tier: 12, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.5, size: 22, speed: 90, col: '#d8b08a', fin: '#c99a72', school: true,
      real: 'Sea bream: a common, calm shoaling fish.' },
    { id: 'permit', name: 'Permit', tier: 12, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.7, size: 28, speed: 90, col: '#b7c4cc', fin: '#8fa0aa',
      real: 'Permit: deep-bodied and cautious, found over flats and wrecks.' },
    { id: 'wahoo', name: 'Wahoo', tier: 12, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.25, size: 26, speed: 180, col: '#5fb0c8', stripe: '#1d4f70', sense: 280,
      real: 'Wahoo: very fast, with a toothy mouth. Strikes at lures.' },
    { id: 'marlin', name: 'Striped marlin', tier: 12, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 34, speed: 170, col: '#3d6fa8', fin: '#2b5a92', finH: 1.6,
      real: 'Striped marlin: a long-billed open-water hunter.' },

    // Tier 13 — Twilight Shoal
    { id: 'lanternfish', name: 'Lanternfish', tier: 13, kind: 'prey', temper: 'docile', shape: 'lantern', hr: 0.35, size: 2, speed: 75, col: '#8fe0ee', fin: '#6fc8da', glow: true, school: true,
      real: 'Lanternfish: schools that glow with light spots to hide from below.' },
    { id: 'hatchetfish', name: 'Hatchetfish', tier: 13, kind: 'prey', temper: 'wary', shape: 'slim', hr: 0.4, size: 4, speed: 90, col: '#c8d4c0', fin: '#a9b8a0', school: true,
      real: 'Hatchetfish: flat, silver and deep, with light organs under the belly.' },
    { id: 'lookdown', name: 'Lookdown', tier: 13, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.5, size: 24, speed: 80, col: '#c9d6df', school: true,
      real: 'Lookdown: a flat, silvery deep fish with a high forehead.' },
    { id: 'opah', name: 'Opah', tier: 13, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.9, size: 26, speed: 80, col: '#e2a25c', fin: '#e8553e', spots: true, spotCol: '#fff1d0',
      real: 'Opah: a deep-sea fish with red fins and a warm body.' },
    { id: 'snakemackerel', name: 'Snake mackerel', tier: 13, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.25, size: 32, speed: 110, col: '#8d9bb0', sense: 220,
      real: 'Snake mackerel: a deep predator with a long, slim body.' },

    // Tier 14 — Lantern Drift
    { id: 'escolar', name: 'Escolar', tier: 14, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 28, speed: 110, col: '#7a5c8a', fin: '#4d3a5c',
      real: 'Escolar: a deep-water fish with an oily body that hunts in the dark.' },
    { id: 'sunfish', name: 'Ocean sunfish', tier: 14, kind: 'harmless', temper: 'docile', shape: 'round', hr: 0.95, size: 40, speed: 25, col: '#b9c6d6', fin: '#9aa9bd',
      real: 'Ocean sunfish: huge and flat, drifting near the top.' },
    { id: 'anglerfish', name: 'Anglerfish', tier: 14, kind: 'ambush', temper: 'aggressive', shape: 'lure', hr: 0.8, size: 46, speed: 40, col: '#6f6aa6', fin: '#58528c', range: 230,
      real: 'Anglerfish: a glowing lure on a stalk draws prey in.' },
    { id: 'lancetfish', name: 'Lancetfish', tier: 14, kind: 'hunter', temper: 'wary', shape: 'slim', hr: 0.25, size: 44, speed: 100, col: '#b6c0d0', sense: 220,
      real: 'Lancetfish: long, toothy and deep; it hunts in the dark.' },

    // Tier 15 — Angler Shelf
    { id: 'pomfret', name: 'Pomfret', tier: 15, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.6, size: 36, speed: 100, col: '#c7d6e8', fin: '#a8bfd8', school: true,
      real: 'Pomfret: a flat, silvery fish that shoals in deep, open water.' },
    { id: 'sablefish', name: 'Sablefish', tier: 15, kind: 'prey', temper: 'docile', shape: 'torpedo', hr: 0.3, size: 44, speed: 60, col: '#5d6b7a', fin: '#46525f',
      real: 'Sablefish: an oily deep-sea fish, slow and calm.' },
    { id: 'thresher', name: 'Thresher shark', tier: 15, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 52, speed: 120, col: '#7e8fa3', finH: 1.6, sense: 260,
      real: 'Thresher shark: a long tail that it uses to stun fish.' },
    { id: 'swordfish', name: 'Swordfish', tier: 15, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.26, size: 60, speed: 180, col: '#3d5f8a', fin: '#2b4a70', finH: 1.4, sense: 300,
      real: 'Swordfish: a fast hunter with a long, flat bill.' },

    // Tier 16 — Slope Edge
    { id: 'oilfish', name: 'Oilfish', tier: 16, kind: 'prey', temper: 'docile', shape: 'torpedo', hr: 0.25, size: 48, speed: 80, col: '#9aa6c8', fin: '#7b88b0',
      real: 'Oilfish: a long, soft, oily fish of the deep slope.' },
    { id: 'cuskeel', name: 'Cusk eel', tier: 16, kind: 'prey', temper: 'docile', shape: 'eel', size: 50, speed: 40, col: '#b58a73',
      real: 'Cusk eel: a slim, bottom-dwelling deep fish.' },
    { id: 'hammerhead', name: 'Hammerhead', tier: 16, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.32, size: 60, speed: 110, col: '#6a7d92', sense: 280,
      real: 'Hammerhead: a wide head with a strong sense for prey.' },
    { id: 'gulper', name: 'Gulper eel', tier: 16, kind: 'hunter', temper: 'aggressive', shape: 'eel', size: 75, speed: 90, col: '#8c8fd1', sense: 320,
      real: 'Gulper eel: a deep-sea eel with a huge, stretchy jaw.' },

    // Tier 17 — Deep Trench
    { id: 'viperfish', name: 'Viperfish', tier: 17, kind: 'prey', temper: 'wary', shape: 'slim', hr: 0.3, size: 22, speed: 80, col: '#b8c8d8', fin: '#8fa0b8', glow: true,
      real: 'Viperfish: long teeth and light organs along its sides.' },
    { id: 'tripodfish', name: 'Tripodfish', tier: 17, kind: 'prey', temper: 'docile', shape: 'round', hr: 0.25, size: 28, speed: 30, col: '#a58ab8', fin: '#8a70a0',
      real: 'Tripodfish: stands on its fin rays on the seafloor, waiting.' },
    { id: 'coelacanth', name: 'Coelacanth', tier: 17, kind: 'harmless', temper: 'docile', shape: 'round', hr: 0.45, size: 60, speed: 20, col: '#7f6bb0', fin: '#5f4e90',
      real: 'Coelacanth: a "living fossil" with lobed fins, slow and deep.' },
    { id: 'oarfish', name: 'Oarfish', tier: 17, kind: 'harmless', temper: 'docile', shape: 'oar', hr: 0.07, size: 50, speed: 22, col: '#e6e9f7', fin: '#ff9e9e',
      real: 'Oarfish: one of the longest bony fish, drifting in the deep.' },
    { id: 'frilled', name: 'Frilled shark', tier: 17, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.22, size: 70, speed: 70, col: '#8c6b6b', sense: 240,
      real: 'Frilled shark: eel-like, with frilled gills and many teeth.' },

    // Tier 18 — Abyss Mouth
    { id: 'goblin', name: 'Goblin shark', tier: 18, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 70, speed: 90, col: '#e8a0a8', fin: '#d8828c',
      real: 'Goblin shark: a deep shark with a long, flat snout and jaws that shoot out.' },
    { id: 'megamouth', name: 'Megamouth shark', tier: 18, kind: 'harmless', temper: 'docile', shape: 'round', hr: 0.4, size: 60, speed: 30, col: '#7c8ec0', belly: '#eef2ff',
      real: 'Megamouth shark: a rare filter feeder with a huge open mouth.' },
    { id: 'sixgill', name: 'Sixgill shark', tier: 18, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 80, speed: 80, col: '#6b5d70', sense: 280,
      real: 'Sixgill shark: six gill slits and a slow, deep hunt.' },
    { id: 'whiteshark', name: 'Great white', tier: 18, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.3, size: 85, speed: 130, col: '#c4d2e6', belly: '#ffffff', finH: 1.6, sense: 340,
      real: 'Great white shark: a top predator of the open ocean.' },

    // Tier 19 — Whale Ocean
    { id: 'greenland', name: 'Greenland shark', tier: 19, kind: 'hunter', temper: 'wary', shape: 'torpedo', hr: 0.3, size: 80, speed: 70, col: '#6f7d8c', fin: '#58646f',
      real: 'Greenland shark: a very long-lived, slow deep-water shark.' },
    { id: 'bluemarlin', name: 'Blue marlin', tier: 19, kind: 'hunter', temper: 'aggressive', shape: 'torpedo', hr: 0.28, size: 88, speed: 170, col: '#2e5fa0', fin: '#1f4580', finH: 1.8, sense: 330,
      real: 'Blue marlin: one of the largest bony fish, with a spear-like bill.' },
    { id: 'sandtiger', name: 'Sand tiger shark', tier: 19, kind: 'hunter', temper: 'docile', shape: 'torpedo', hr: 0.3, size: 90, speed: 60, col: '#b0a58a', fin: '#948a70',
      real: 'Sand tiger shark: toothy but calm, it rarely hunts people.' },

    // Tier 20 — the top
    { id: 'basking', name: 'Basking shark', tier: 20, kind: 'harmless', temper: 'docile', shape: 'torpedo', hr: 0.32, size: 85, speed: 30, col: '#8f9db0', belly: '#e8eef4',
      real: 'Basking shark: the second-largest fish, a calm filter feeder.' },
    { id: 'whaleshark', name: 'Whale shark', tier: 20, kind: 'harmless', temper: 'docile', shape: 'whale', hr: 0.3, size: 100, speed: 35, col: '#7f9fc7', belly: '#eef6ff', spots: true, spotCol: '#ffffff',
      real: 'Whale shark: the largest fish alive. It filter-feeds on plankton, the same food you start on.' },
    { id: 'giantsunfish', name: 'Giant sunfish', tier: 20, kind: 'harmless', temper: 'docile', shape: 'round', hr: 0.95, size: 92, speed: 20, col: '#a8b8c8', fin: '#8a9cb0',
      real: 'Giant sunfish: a huge, flat fish that drifts near the surface.' },

    // v0.12 background items (Settings → Background items, on by default). Appended after the tiers above, so the
    // first species of each tier (the player's form) is unchanged. bg: true means they come and go with that setting.
    // Scenery and drifting things never chase you. Shrimp, squid and urchins are food (urchins cost spines).
    { id: 'clam', name: 'Clam', tier: 1, kind: 'harmless', temper: 'docile', shape: 'clam', hr: 0.5, size: 2.5, speed: 0, col: '#e9d8c0', fin: '#b9977a', bed: true, bg: true,
      real: 'Clam: sits in the sand and closes its shell when touched. Not food.' },
    { id: 'rock', name: 'Rock', tier: 1, kind: 'harmless', temper: 'docile', shape: 'rock', hr: 0.5, size: 4, speed: 0, col: '#8a949c', fin: '#a6aeb4', bed: true, bg: true,
      real: 'A rock on the seabed. Not food.' },
    { id: 'shrimp', name: 'Shrimp', tier: 2, kind: 'prey', temper: 'docile', shape: 'shrimp', hr: 0.3, size: 0.9, speed: 70, col: '#ff9a8b', fin: '#ffd0c4', bg: true,
      real: 'Shrimp: a small, edible crustacean that flicks its feelers.' },
    { id: 'urchin', name: 'Purple sea urchin', tier: 2, kind: 'prey', temper: 'docile', shape: 'urchin', hr: 0.8, size: 1.6, speed: 14, col: '#6b3f7a', fin: '#b98bd0', spiky: true, bed: true, bg: true,
      real: 'Purple sea urchin: covered in spines. Eating one costs you spines (2 size).' },
    { id: 'boat', name: 'Rowing boat', tier: 4, kind: 'harmless', temper: 'docile', shape: 'boat', hr: 0.5, size: 9, speed: 12, col: '#f4f1ea', fin: '#d9573f', surf: true, bg: true,
      real: 'A rowing boat drifting on the surface. Not food.' },
    { id: 'squid', name: 'Squid', tier: 5, kind: 'prey', temper: 'wary', shape: 'squid', hr: 0.6, size: 4.5, speed: 95, col: '#c99cd8', fin: '#e3c6ef', bg: true,
      real: 'Squid: jets off with a puff of ink. Edible.' },
    { id: 'longurchin', name: 'Long-spined urchin', tier: 5, kind: 'prey', temper: 'docile', shape: 'urchin', hr: 0.9, size: 4.5, speed: 10, col: '#2c2236', fin: '#7a6a92', spiky: true, bed: true, bg: true,
      real: 'Long-spined urchin: long black spines. Eating one costs you spines (2 size).' },
    { id: 'sub', name: 'Submarine', tier: 6, kind: 'harmless', temper: 'docile', shape: 'sub', hr: 0.45, size: 16, speed: 30, col: '#f2c94c', fin: '#2d3a4a', bg: true,
      real: 'A small submarine that has drifted off course. Not food.' },
    { id: 'lionsmane', name: "Lion's mane jellyfish", tier: 7, kind: 'harmless', temper: 'docile', shape: 'jelly', hr: 0.6, size: 6, speed: 16, col: '#e0a24a', fin: '#f7d79a', sting: true, bg: true,
      real: "Lion's mane jellyfish: a big floating bell with long tentacles. It stings on contact and cannot be eaten." }
  ];

  // v0.12 forms: five more species on every level, each one you can evolve into. Each has a build that sets its
  // bite (atk), speed (spd) and health (hp) against an all-round fish (1). When you level up, the game picks your
  // next form at random, weighted towards the builds that suit how you have played (see pickForm in game.js).
  var BUILDS = {
    biter:   { atk: 1.4,  spd: 0.95, hp: 0.9,  size: 1.05, temper: 'wary',   say: 'hard bites' },
    swift:   { atk: 0.9,  spd: 1.3,  hp: 0.9,  size: 0.9,  temper: 'docile', say: 'fast' },
    tough:   { atk: 1.0,  spd: 0.85, hp: 1.45, size: 1.15, temper: 'docile', say: 'lots of health' },
    striker: { atk: 1.25, spd: 1.15, hp: 0.8,  size: 1.0,  temper: 'wary',   say: 'hard bites and fast' },
    guard:   { atk: 1.2,  spd: 0.85, hp: 1.25, size: 1.1,  temper: 'wary',   say: 'hard bites and tough' },
    cruiser: { atk: 0.85, spd: 1.15, hp: 1.25, size: 1.0,  temper: 'docile', say: 'fast and tough' }
  };
  // A size for each tier's forms, smoother than the first species of the tier (some deep-sea ones are tiny).
  var TIER_SIZE = [0.9, 1.6, 2.2, 2.8, 3.6, 4.5, 6, 9, 13, 15, 18, 22, 26, 30, 36, 48, 55, 70, 80, 90];
  var SHAPE_HR = { round: 0.55, slim: 0.3, torpedo: 0.3, lure: 0.6, puff: 0.8, oar: 0.25, whale: 0.35 };
  // [id, name, shape, body colour, fin colour, build, real fact], five per tier.
  var FORMS = [
    [['betta', 'Betta', 'round', '#c0392b', '#8e44ad', 'biter', 'Betta: a fighting fish that flares its fins.'],
     ['danio', 'Pearl danio', 'slim', '#d8e2f0', '#ffb3c1', 'swift', 'Pearl danio: a quick, shimmering little shoaler.'],
     ['platy', 'Platy', 'round', '#ff8a3d', '#ffc36b', 'tough', 'Platy: a small, sturdy live-bearer.'],
     ['swordtail', 'Swordtail', 'slim', '#ff6b4a', '#ffd166', 'striker', 'Swordtail: the male tail ends in a long sword.'],
     ['molly', 'Black molly', 'round', '#3a3f4a', '#6b7280', 'cruiser', 'Black molly: hardy and calm, it copes with most water.']],
    [['pinfish', 'Pinfish', 'round', '#c9d1b0', '#f2e27a', 'biter', 'Pinfish: sharp spines and a nip for anything.'],
     ['silverside', 'Silverside', 'slim', '#dfe9f2', '#a9c3dc', 'swift', 'Silverside: a slim, fast fish of the shallows.'],
     ['mudskipper', 'Mudskipper', 'round', '#8a7a5a', '#5f9ad0', 'tough', 'Mudskipper: so tough it walks on the mud.'],
     ['sandsmelt', 'Sand smelt', 'slim', '#cfe3e8', '#8fb5c4', 'striker', 'Sand smelt: darts in shoals over the sand.'],
     ['killifish', 'Killifish', 'round', '#6fb0a0', '#f2a65a', 'cruiser', 'Killifish: small, hardy and colourful.']],
    [['sculpin', 'Sculpin', 'round', '#8a6b4a', '#c49a6c', 'biter', 'Sculpin: a big mouth that swallows what it can.'],
     ['gunnel', 'Rock gunnel', 'eel', '#b0845a', '#7a5a3a', 'swift', 'Rock gunnel: a slippery fish that wriggles between rocks.'],
     ['rockgoby', 'Rock goby', 'round', '#6b5a48', '#a89070', 'tough', 'Rock goby: clings to rocks through the waves.'],
     ['corkwing', 'Corkwing wrasse', 'round', '#5f9a6b', '#d9b36b', 'guard', 'Corkwing wrasse: builds a nest and guards it.'],
     ['shanny', 'Shanny', 'round', '#7a8a5a', '#b5c27a', 'cruiser', 'Shanny: survives hours out of water at low tide.']],
    [['weever', 'Lesser weever', 'slim', '#d8c49a', '#2d2d2d', 'biter', 'Lesser weever: hides in the sand with venomous spines.'],
     ['dragonet', 'Dragonet', 'slim', '#e0a03a', '#3fa9e0', 'swift', 'Dragonet: a bright fish that flits over the sand.'],
     ['flounder', 'Flounder', 'round', '#a08868', '#7a6a50', 'tough', 'Flounder: a flatfish that lies hidden on the bottom.'],
     ['redmullet', 'Red mullet', 'slim', '#f08a6b', '#ffd0a8', 'striker', 'Red mullet: feels for food with its barbels.'],
     ['sandperch', 'Sand perch', 'round', '#c9a87a', '#8a6b4a', 'guard', 'Sand perch: holds its patch of sand.']],
    [['hogfish', 'Hogfish', 'round', '#f0b8a0', '#d9573f', 'biter', 'Hogfish: roots in the sand with a long snout.'],
     ['goatfish', 'Yellow goatfish', 'slim', '#f2e6c9', '#ffd23a', 'swift', 'Yellow goatfish: schools over the reef by day.'],
     ['squirrelfish', 'Squirrelfish', 'round', '#e8553e', '#ffd0c0', 'tough', 'Squirrelfish: big eyes and spiny armour.'],
     ['soldierfish', 'Soldierfish', 'round', '#d94a3a', '#f2a090', 'guard', 'Soldierfish: holds its cave against others.'],
     ['bannerfish', 'Bannerfish', 'round', '#f4f1ea', '#2d2d2d', 'cruiser', 'Bannerfish: a long white banner on its back.']],
    [['surgeonfish', 'Surgeonfish', 'round', '#5f86b8', '#ffd34d', 'biter', 'Surgeonfish: a scalpel-sharp spine by its tail.'],
     ['moorishidol', 'Moorish idol', 'round', '#ffe36b', '#2a2a2a', 'swift', 'Moorish idol: a striped reef fish with a long fin.'],
     ['batfish', 'Batfish', 'round', '#c9b48a', '#8a7a5a', 'tough', 'Batfish: tall and round, it drifts in shoals.'],
     ['filefish', 'Filefish', 'slim', '#b8c96b', '#7a8a3a', 'striker', 'Filefish: rough skin and a spine that locks up.'],
     ['rabbitfish', 'Rabbitfish', 'round', '#e8d06b', '#c4a840', 'cruiser', 'Rabbitfish: grazes weed and carries venomous spines.']],
    [['coraltrout', 'Coral trout', 'torpedo', '#e05a4a', '#2d6fd0', 'biter', 'Coral trout: a red grouper that ambushes on the reef.'],
     ['yellowtail', 'Yellowtail snapper', 'slim', '#c9d6e0', '#ffd23a', 'swift', 'Yellowtail snapper: quick, with a yellow streak.'],
     ['emperor', 'Spangled emperor', 'round', '#c9b8a0', '#5fa9e0', 'tough', 'Spangled emperor: blue spots and a strong build.'],
     ['bluefintrevally', 'Bluefin trevally', 'torpedo', '#8aa9c9', '#3fa9e0', 'striker', 'Bluefin trevally: hunts in fast packs.'],
     ['blackgrouper', 'Black grouper', 'round', '#5a5a50', '#3a3a33', 'guard', 'Black grouper: a heavy fish that guards its cave.']],
    [['queentrigger', 'Queen triggerfish', 'round', '#5fa9c9', '#e0c04a', 'biter', 'Queen triggerfish: strong teeth crack sea urchins.'],
     ['ladyfish', 'Ladyfish', 'slim', '#e0e8f0', '#a9c3dc', 'swift', 'Ladyfish: leaps and runs when hooked.'],
     ['napoleon', 'Napoleon wrasse', 'round', '#3f9a8a', '#7fd6b0', 'tough', 'Napoleon wrasse: a huge wrasse with a bump on its head.'],
     ['spanishmack', 'Spanish mackerel', 'torpedo', '#c4d6e8', '#e8c04a', 'striker', 'Spanish mackerel: fast and toothy.'],
     ['tarpon', 'Tarpon', 'torpedo', '#d8e2ea', '#8aa0b8', 'cruiser', 'Tarpon: big silver scales, it can gulp air.']],
    [['yellowtailaj', 'Yellowtail amberjack', 'torpedo', '#c9d6c0', '#ffd23a', 'biter', 'Yellowtail amberjack: a powerful hunter of bait fish.'],
     ['skipjack', 'Skipjack tuna', 'torpedo', '#5f7fa8', '#c4d6e8', 'swift', 'Skipjack tuna: a small, very fast tuna.'],
     ['cubera', 'Cubera snapper', 'round', '#b05a4a', '#8a4a3a', 'tough', 'Cubera snapper: the largest snapper, with big canines.'],
     ['atlbonito', 'Atlantic bonito', 'torpedo', '#4f7fa8', '#9fb8d8', 'striker', 'Atlantic bonito: striped and quick to strike.'],
     ['littletunny', 'Little tunny', 'torpedo', '#4a6a90', '#b0c4dc', 'cruiser', 'Little tunny: a small tuna that travels far.']],
    [['kingmack', 'King mackerel', 'torpedo', '#8aa0b8', '#5f7a96', 'biter', 'King mackerel: razor teeth and a fast strike.'],
     ['albacore', 'Albacore', 'torpedo', '#3f5f88', '#c9d6e8', 'swift', 'Albacore: a long-finned tuna that crosses oceans.'],
     ['giantgrouper', 'Giant grouper', 'round', '#6b6b58', '#4a4a3a', 'tough', 'Giant grouper: one of the largest reef fish.'],
     ['narrowmack', 'Narrow-barred mackerel', 'torpedo', '#9fb0c4', '#e0c04a', 'striker', 'Narrow-barred mackerel: a long, fast mackerel.'],
     ['longtail', 'Longtail tuna', 'torpedo', '#4a6a90', '#e8d06b', 'cruiser', 'Longtail tuna: a coastal tuna built for long swims.']],
    [['blacktip', 'Blacktip reef shark', 'torpedo', '#b0b8c0', '#2a2d33', 'biter', 'Blacktip reef shark: black tips on every fin.'],
     ['spinner', 'Spinner shark', 'torpedo', '#a8b4c0', '#7a8a9a', 'swift', 'Spinner shark: spins out of the water as it hunts.'],
     ['nurse', 'Nurse shark', 'torpedo', '#b89a6b', '#8a7050', 'tough', 'Nurse shark: rests on the bottom by day.'],
     ['lemon', 'Lemon shark', 'torpedo', '#d8c48a', '#b0a060', 'guard', 'Lemon shark: yellowish, it keeps to its home range.'],
     ['bonnethead', 'Bonnethead', 'torpedo', '#9aa8b4', '#6b7a88', 'cruiser', 'Bonnethead: a small hammerhead with a round head.']],
    [['wolffish', 'Atlantic wolffish', 'round', '#8a9098', '#5a6068', 'biter', 'Atlantic wolffish: huge teeth crush crabs and shells.'],
     ['spearfish', 'Shortbill spearfish', 'torpedo', '#3f5f88', '#9fb8d8', 'swift', 'Shortbill spearfish: a small billfish built for speed.'],
     ['wreckfish', 'Wreckfish', 'round', '#7a6a5a', '#5a4a3a', 'tough', 'Wreckfish: a big, slow fish that lives around wrecks.'],
     ['blueshark', 'Blue shark', 'torpedo', '#3f6fb8', '#9fc0e8', 'striker', 'Blue shark: long-finned and quick, it roams the open sea.'],
     ['gianttrevally', 'Giant trevally', 'torpedo', '#8a9aa8', '#3a4a5a', 'guard', 'Giant trevally: a heavy hunter that even catches birds.']],
    [['dragonfish', 'Black dragonfish', 'eel', '#2a2a3a', '#5fd0c0', 'biter', 'Black dragonfish: glowing lures and needle teeth.'],
     ['pearlside', 'Pearlside', 'slim', '#b8c4d8', '#5f7fa8', 'swift', 'Pearlside: a tiny silver fish that rises at night.'],
     ['barreleye', 'Barreleye', 'round', '#9aa0a8', '#5fd0c0', 'tough', 'Barreleye: a see-through head with tube eyes.'],
     ['snipeeel', 'Snipe eel', 'eel', '#8a7a6a', '#5a4a3a', 'striker', 'Snipe eel: a long eel with bird-like jaws.'],
     ['bristlemouth', 'Bristlemouth', 'slim', '#4a4a5a', '#8a8aa0', 'cruiser', 'Bristlemouth: perhaps the most common fish on Earth.']],
    [['daggertooth', 'Daggertooth', 'torpedo', '#6b6b78', '#9a9aa8', 'biter', 'Daggertooth: long fangs for the dark.'],
     ['telescope', 'Telescopefish', 'slim', '#8a8aa0', '#c4c4d8', 'swift', 'Telescopefish: tube eyes that look straight ahead.'],
     ['swallower', 'Black swallower', 'round', '#2a2a30', '#4a4a55', 'tough', 'Black swallower: its stomach stretches round fish bigger than itself.'],
     ['fangtooth', 'Fangtooth', 'round', '#3a2a2a', '#6b4a4a', 'guard', 'Fangtooth: the biggest teeth for its size of any fish.'],
     ['pelicaneel', 'Pelican eel', 'eel', '#2a2a3a', '#5a5a6b', 'cruiser', 'Pelican eel: a huge mouth on a whip-thin body.']],
    [['stargazer', 'Stargazer', 'round', '#a89a7a', '#6b5f4a', 'biter', 'Stargazer: buried in sand, eyes on top, it strikes upward.'],
     ['ghostshark', 'Ghost shark', 'torpedo', '#c4c4cc', '#8a8a98', 'swift', 'Ghost shark: a pale cousin of sharks that glides along.'],
     ['monkfish', 'Monkfish', 'lure', '#8a7a5a', '#5a4a3a', 'tough', 'Monkfish: a flat angler with a mouth like a trap.'],
     ['seatoad', 'Sea toad', 'lure', '#c47a5a', '#8a4a3a', 'guard', 'Sea toad: walks on its fins and fishes with a lure.'],
     ['coffinfish', 'Coffinfish', 'puff', '#e0a090', '#b06a5a', 'cruiser', 'Coffinfish: puffs up with water to look bigger.']],
    [['lingcod', 'Lingcod', 'torpedo', '#8a8a6b', '#5a5a40', 'biter', 'Lingcod: a big-mouthed hunter of the rocky slope.'],
     ['grenadier', 'Grenadier', 'slim', '#9aa0a8', '#6b7078', 'swift', 'Grenadier: a big head and a long rat-like tail.'],
     ['roughy', 'Orange roughy', 'round', '#e8703a', '#c4502a', 'tough', 'Orange roughy: can live for more than 150 years.'],
     ['halibut', 'Pacific halibut', 'round', '#7a6a58', '#5a4a3a', 'guard', 'Pacific halibut: a giant flatfish of the cold slope.'],
     ['hagfish', 'Hagfish', 'eel', '#c49a9a', '#9a7070', 'cruiser', 'Hagfish: slips away in a cloud of slime.']],
    [['seadevil', 'Black seadevil', 'lure', '#2a2a30', '#5fd0c0', 'biter', 'Black seadevil: an angler with a glowing lure.'],
     ['rattail', 'Rattail', 'slim', '#9a9aa8', '#6b6b78', 'swift', 'Rattail: cruises the trench floor with a whip tail.'],
     ['snailfish', 'Snailfish', 'round', '#f0d8d0', '#c4a8a0', 'tough', 'Snailfish: lives deeper than any other fish.'],
     ['deepcod', 'Deep-sea cod', 'round', '#8a8a90', '#5a5a60', 'guard', 'Deep-sea cod: a slow, strong bottom fish.'],
     ['dreamer', 'Smooth dreamer', 'puff', '#3a2a40', '#6b5a78', 'cruiser', 'Smooth dreamer: a round angler of the deep.']],
    [['sevengill', 'Broadnose sevengill', 'torpedo', '#8a8a80', '#5a5a50', 'biter', 'Broadnose sevengill: seven gill slits and a big bite.'],
     ['ribbonfish', 'Ribbonfish', 'oar', '#e0e8f0', '#ff8a8a', 'swift', 'Ribbonfish: a long silver ribbon with a red fin.'],
     ['sleeper', 'Pacific sleeper shark', 'torpedo', '#5a5a60', '#3a3a40', 'tough', 'Pacific sleeper shark: slow, huge and very hard to stop.'],
     ['atlbluefin', 'Atlantic bluefin', 'torpedo', '#2d4f8a', '#c4d6e8', 'striker', 'Atlantic bluefin: a warm-blooded giant tuna.'],
     ['giantseabass', 'Giant sea bass', 'round', '#3a3a40', '#5a5a60', 'guard', 'Giant sea bass: a gentle giant that guards its rocks.']],
    [['tiger', 'Tiger shark', 'torpedo', '#9a9a88', '#5a5a48', 'biter', 'Tiger shark: stripes, and a bite for almost anything.'],
     ['mako', 'Shortfin mako', 'torpedo', '#3f5fa8', '#c4d0e8', 'swift', 'Shortfin mako: the fastest shark in the sea.'],
     ['manta', 'Giant manta ray', 'whale', '#2a2d3a', '#f0f0f0', 'tough', 'Giant manta ray: a huge, gentle ray that filters plankton.'],
     ['whitetip', 'Oceanic whitetip', 'torpedo', '#8a8a90', '#f4f4f4', 'striker', 'Oceanic whitetip: bold, with white-tipped fins.'],
     ['bull', 'Bull shark', 'torpedo', '#8a8a88', '#5a5a58', 'guard', 'Bull shark: stocky and strong, it even swims up rivers.']],
    [['greathammer', 'Great hammerhead', 'torpedo', '#9aa0a8', '#6b7078', 'biter', 'Great hammerhead: the largest hammerhead, a fierce hunter.'],
     ['blackmarlin', 'Black marlin', 'torpedo', '#2a3a5a', '#5f7fa8', 'swift', 'Black marlin: one of the fastest fish alive.'],
     ['sturgeon', 'Beluga sturgeon', 'torpedo', '#9a9a8a', '#6b6b5a', 'tough', 'Beluga sturgeon: armoured plates and a vast size.'],
     ['longfinmako', 'Longfin mako', 'torpedo', '#2d4f8a', '#c4d6e8', 'striker', 'Longfin mako: a rare, long-finned ocean hunter.'],
     ['goliath', 'Goliath grouper', 'round', '#6b6040', '#4a4430', 'guard', 'Goliath grouper: a huge grouper that booms to scare others.']]
  ];
  FORMS.forEach(function (tier, i) {
    tier.forEach(function (f) {
      var b = BUILDS[f[5]], sp = {
        id: f[0], name: f[1], tier: i + 1, kind: 'prey', temper: b.temper, shape: f[2], col: f[3], fin: f[4],
        size: +(TIER_SIZE[i] * b.size).toFixed(2), speed: Math.round(90 * b.spd + 2 * (i + 1)),
        atk: b.atk, spd: b.spd, hp: b.hp, build: f[5], form: true, real: f[6]
      };
      if (SHAPE_HR[f[2]]) sp.hr = SHAPE_HR[f[2]];
      SPECIES.push(sp);
    });
  });


  // Depth zones: the sea gets deeper, bigger and darker tier by tier.
  var ZONES = [
    { name: 'Sunny Shallows', top: '#dff8f1', bottom: '#b8ead8', sand: '#f7e6bf', rays: true },
    { name: 'Coral Reef', top: '#d6f3f7', bottom: '#a9e1ec', sand: '#f4dcc8', rays: true },
    { name: 'Open Blue', top: '#c6e4fb', bottom: '#8fc3ec', sand: '#d9e7f3', rays: false },
    { name: 'Twilight', top: '#c9c8f0', bottom: '#8d8fd0', sand: '#b9b6dc', rays: false },
    { name: 'Deep Trench', top: '#6f73b5', bottom: '#333b74', sand: '#2a3163', rays: false }
  ];

  var LEVEL_NAMES = [
    'Sunny Cove', 'Sea-grass Flats', 'Rock Pool Edge', 'Sandy Shelf',
    'Coral Gardens', 'Anemone Bay', 'Reef Wall', 'Parrot Lagoon',
    'Open Blue', 'Tuna Run', 'Shark Lane', 'Wide Water',
    'Twilight Shoal', 'Lantern Drift', 'Angler Shelf', 'Slope Edge',
    'Deep Trench', 'Oar Valley', 'Abyss Mouth', 'Whale Ocean'
  ];

  // The player starts at this size (v0.10: was 1). Every tier goal below is scaled by it, so the climb keeps its shape.
  var START_SIZE = 3;

  // Size needed to leave each tier, before scaling (tier 20 = 100 = the largest fish ever, at START_SIZE 1).
  // v0.11 pacing. SPAN_BASE is each level's size gain as it was (sizes 3 to 300 over 20 levels).
  // Levels 1-5 need three times that much growth (more food before you move on); later levels need 13% less,
  // so the largest fish is still about 300. Each meal still gives the same growth as before (levelInfo.meal).
  var SPAN_BASE = [3, 3, 3, 3, 6, 6, 6, 9, 9, 12, 12, 15, 18, 21, 21, 24, 27, 30, 33, 36];
  var GOALS = (function () {
    var out = [], g = START_SIZE, i;
    for (i = 0; i < SPAN_BASE.length; i++) {
      g += SPAN_BASE[i] * (i < 5 ? 3 : 0.87);
      out.push(g);
    }
    return out;
  })();

  // Difficulty is the predator:prey ratio of the fish the sea sends you.
  // "Predator" = a non-docile fish at least 1.1x your size (it can eat you).
  // "Prey" = a fish you can eat (at most 0.87x your size).
  var DIFFICULTY = {
    // v0.12: Easy runs 5 minutes (limit, in seconds); the others keep the 15-minute cap.
    easy:   { label: 'Easy',   ratio: '1 predator : 4 prey', share: 0.2, limit: 300 },
    medium: { label: 'Medium', ratio: '1 predator : 2 prey', share: 1 / 3 },
    hard:   { label: 'Hard',   ratio: '1 predator : 1 prey', share: 0.5 },
    // v0.11: no predators, and nothing can hurt you. Play without any stress.
    calm:   { label: 'Calm',   ratio: 'no predators, you cannot be eaten', share: 0, calm: true, limit: 300 }
  };

  function zoneIndex(n) { return n <= 4 ? 0 : n <= 8 ? 1 : n <= 12 ? 2 : n <= 16 ? 3 : 4; }

  var SEA_GROWTH = 1.16;   // the sea grows 16% a level (v0.11)
  // v0.12: the sea's height is fixed (the level-1 height). The camera zooms out instead, so by level 20 you see
  // most of the depth. For a big fish to fit, its drawn length grows with the square root of its size past 20.
  var SEA_H = 2000;
  function fishLen(size) { return size <= 20 ? 22 + size * 5 : 122 * Math.sqrt(size / 20); }
  // v0.11: the sea is never too narrow for the camera. The camera widens the view with the largest fish of a level
  // (see updateCamera in game.js), so a level's sea is at least the width that holds the 25%-interpolated view on a
  // landscape phone at 90% of the sea and a 3x zoom (39 x the fish length at the goal, divided by 1 + 0.25 x the level fraction).
  function seaWidth(n) {
    var goal = GOALS[n - 1], t = (n - 1) / 19;
    return Math.max(2400 * Math.pow(SEA_GROWTH, n - 1), 39 * fishLen(goal) / (1 + 0.25 * t));
  }

  function levelInfo(n) {
    return {
      n: n,
      name: LEVEL_NAMES[n - 1],
      zone: ZONES[zoneIndex(n)],
      zoneIndex: zoneIndex(n),
      // v0.11: the sea starts twice the v0.10 size and grows 16% a level, so the camera can show a fish
      // 25% bigger by level 20 without the view passing 80% of the sea (see updateCamera in game.js).
      W: Math.round(seaWidth(n)),
      H: SEA_H,   // v0.12: the sea is the same height on every level; only its width grows
      goal: GOALS[n - 1],
      enterSize: n === 1 ? START_SIZE : GOALS[n - 2],
      meal: SPAN_BASE[n - 1]   // the growth a meal gives this level (v0.11), unchanged by the XP needed
    };
  }

  // The player's form on a tier: the first species listed for that tier.
  function leadOf(n) {
    for (var i = 0; i < SPECIES.length; i++) if (SPECIES[i].tier === n) return SPECIES[i];
    return SPECIES[0];
  }

  var CONFIG = {
    VERSION: '0.11',                    // see CHANGELOG.md
    VERSION_DATE: '2026-11-07',
    // Build stamp: changes on every merge, with the ?b= on the script and style links in index.html. It shows on the title
    // screen and in Settings, so a device running an old cached copy can be told apart from the current build.
    BUILD: '2026-11-08.2',
    TIME_LIMIT: 900,                    // hard stop at 15 minutes
    LIVES: 3,
    TENSION: { start: 150, full: 300 }, // harder from 2:30, full by 5:00 (raises the predator share by up to 50%)
    // Database: the shared Family Supabase project (same as Expansion Wars).
    // The publishable key is public by design; notes only open to the signed-in family account.
    supabaseUrl: 'https://twvqvutrcobedvuhnzxq.supabase.co',
    supabaseKey: 'sb_publishable_eqUo8HEdEB1hMQM4CpSVqA_9i6b0qCo',
    notesTable: 'fish_notes'
  };

  window.FishData = {
    SPECIES: SPECIES,
    ZONES: ZONES,
    GOALS: GOALS,
    START_SIZE: START_SIZE,
    LEVEL_NAMES: LEVEL_NAMES,
    DIFFICULTY: DIFFICULTY,
    levelInfo: levelInfo,
    fishLen: fishLen,
    SEA_H: SEA_H,
    BUILDS: BUILDS,
    leadOf: leadOf,
    CONFIG: CONFIG
  };
})();
