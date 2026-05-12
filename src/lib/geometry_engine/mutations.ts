import { PBIMProject } from '../pbim/schema';

export function applyActionToPBIM(project: PBIMProject, action: any): PBIMProject {
  // Clonar o projeto para não mutar o estado original diretamente
  const newProject = JSON.parse(JSON.stringify(project)) as PBIMProject;

  if (action.action === 'modify_space' && action.operation === 'extend') {
    const space = newProject.spaces.find(s => s.id === action.target_id);
    if (!space) return newProject;

    const dist = action.distance_m || 0;
    const dirStr = (action.direction || '').toLowerCase();
    
    let dx = 0; let dy = 0;
    // O eixo Y em plantas no nosso svg = +y pra baixo, mas usaremos a lógica cartesiana tradicional
    if (dirStr.includes('fundo') || dirStr.includes('back') || dirStr.includes('rear')) dy = dist;
    else if (dirStr.includes('frente') || dirStr.includes('front')) dy = -dist;
    else if (dirStr.includes('direita') || dirStr.includes('right')) dx = dist;
    else if (dirStr.includes('esquerda') || dirStr.includes('left')) dx = -dist;

    if (dx === 0 && dy === 0) return newProject; // Nenhuma direção clara detectada.

    const walls = newProject.walls.filter(w => space.boundary_walls.includes(w.id));
    if (walls.length === 0) return newProject;

    // Acha os limites atuais do ambiente para saber quais nós (vértices) mover
    const minX = Math.min(...walls.flatMap(w => [w.start[0], w.end[0]]));
    const maxX = Math.max(...walls.flatMap(w => [w.start[0], w.end[0]]));
    const minY = Math.min(...walls.flatMap(w => [w.start[1], w.end[1]]));
    const maxY = Math.max(...walls.flatMap(w => [w.start[1], w.end[1]]));

    const tolerance = 0.1;

    walls.forEach(w => {
       // Atualiza ponto Start 
       if ((dy > 0 && Math.abs(w.start[1] - maxY) < tolerance) || 
           (dy < 0 && Math.abs(w.start[1] - minY) < tolerance) ||
           (dx > 0 && Math.abs(w.start[0] - maxX) < tolerance) ||
           (dx < 0 && Math.abs(w.start[0] - minX) < tolerance)) {
             w.start[0] += dx;
             w.start[1] += dy;
       }
       // Atualiza ponto End
       if ((dy > 0 && Math.abs(w.end[1] - maxY) < tolerance) || 
           (dy < 0 && Math.abs(w.end[1] - minY) < tolerance) ||
           (dx > 0 && Math.abs(w.end[0] - maxX) < tolerance) ||
           (dx < 0 && Math.abs(w.end[0] - minX) < tolerance)) {
             w.end[0] += dx;
             w.end[1] += dy;
       }
    });

    // Recalcula Area Real
    const newMaxX = Math.max(...walls.flatMap(w => [w.start[0], w.end[0]]));
    const newMinX = Math.min(...walls.flatMap(w => [w.start[0], w.end[0]]));
    const newMaxY = Math.max(...walls.flatMap(w => [w.start[1], w.end[1]]));
    const newMinY = Math.min(...walls.flatMap(w => [w.start[1], w.end[1]]));
    
    space.area_actual = Number(((newMaxX - newMinX) * (newMaxY - newMinY)).toFixed(2));
  }

  // Outras operações podem ser adicionadas no futuro (ex: move_wall, add_door, etc)

  return newProject;
}
