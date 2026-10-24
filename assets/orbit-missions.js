export const MISSIONS = {
  festival: {
    id:'festival', name:'Фестиваль', width:7, height:5, finish:'6,4',
    briefing:'Соберите три батареи и доставьте энергию на станцию справа внизу.',
    batteries:['2,0','4,2','0,4'], rocks:['1,1','3,1','5,1','1,3','3,3','5,3'],
    scans:[], gates:[], barriers:[], patrol:[],
  },
  club: {
    id:'club', name:'Исследователи · Туманность', width:8, height:6, finish:'7,5',
    briefing:'Включите ретранслятор, просканируйте две аномалии и привезите две батареи на станцию.',
    batteries:['0,5','7,0'], rocks:['1,1','2,1','2,3','5,1','6,3','5,4'],
    relay:'2,2', barriers:['4,0','4,1','4,2','4,3','4,4','4,5'], scans:['1,4','6,2'], gates:[], patrol:[],
  },
  cup: {
    id:'cup', name:'Кубок пилотов · Перехват', width:9, height:6, finish:'8,5',
    briefing:'Заберите батарею, пройдите ворота 1 → 2 → 3 и финишируйте. Патруль сдвигается после каждого хода. За столкновение — три штрафных хода.',
    batteries:['2,0'], rocks:['1,1','2,3','5,1','5,4','7,3'],
    gates:['3,0','7,2','1,5'], scans:[], barriers:[],
    patrol:['3,2','4,2','5,2','6,2','6,3','5,3','4,3','3,3'], gold:30, silver:40,
  },
};
export const missionFor = game => MISSIONS[game.life?.contract] || MISSIONS.festival;
export const patrolAt = (mission, turn) => mission.patrol.length ? mission.patrol[turn % mission.patrol.length] : null;
export const missionReady = (mission, flight) => flight.collected.length === mission.batteries.length
  && (!mission.relay || flight.relay) && (flight.scanned?.length || 0) === mission.scans.length && (flight.gates || 0) === mission.gates.length;
export const raceMedal = (mission, flight) => !mission.gold ? '' : flight.moves <= mission.gold ? 'Золото' : flight.moves <= mission.silver ? 'Серебро' : 'Бронза';
