// Starter plan: conservative return-to-training, Crunch-standard equipment.
// Every working exercise: 2 sets of 10–12, add weight when both sets feel easy.
const ex = (id, pName, pTarget, bName, bTarget) =>
  ({ id, primary: { name: pName, target: pTarget }, backup: { name: bName, target: bTarget } });

export const defaultPlan = {
  workouts: [
    {
      id: 'a',
      name: 'Workout A',
      exercises: [
        ex('a1', 'Warm-up: treadmill walk (brisk, slight incline)', '8 min', 'Stationary bike', '8 min'),
        ex('a2', 'Leg press', '2 × 10–12', 'Dumbbell goblet squat', '2 × 10–12'),
        ex('a3', 'Chest press machine', '2 × 10–12', 'Dumbbell bench press', '2 × 10–12'),
        ex('a4', 'Seated cable row', '2 × 10–12', 'One-arm dumbbell row', '2 × 10–12 each'),
        ex('a5', 'Shoulder press machine', '2 × 10–12', 'Seated dumbbell press', '2 × 10–12'),
        ex('a6', 'Plank', '2 × 30s', 'Dead bug', '2 × 10 each side'),
        ex('a7', 'Cool-down: easy walk', '5 min', '', ''),
      ],
    },
    {
      id: 'b',
      name: 'Workout B',
      exercises: [
        ex('b1', 'Warm-up: stationary bike', '8 min', 'Treadmill walk', '8 min'),
        ex('b2', 'Leg curl + leg extension', '2 × 10–12 each', 'Dumbbell Romanian deadlift', '2 × 10–12'),
        ex('b3', 'Lat pulldown', '2 × 10–12', 'Assisted pull-up machine', '2 × 8–10'),
        ex('b4', 'Incline chest press machine', '2 × 10–12', 'Incline dumbbell press', '2 × 10–12'),
        ex('b5', 'Cable face pull', '2 × 12–15', 'Dumbbell rear-delt fly', '2 × 12–15'),
        ex('b6', 'Pallof press (cable)', '2 × 10 each side', 'Side plank', '2 × 20s each side'),
        ex('b7', 'Cool-down: easy walk', '5 min', '', ''),
      ],
    },
  ],
};
