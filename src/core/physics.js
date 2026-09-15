



// Physics simulation: fixed timestep, actual cylinder poses determine faces.
function createCoinWorld(input, round){
  const C = CANNON, world = new C.World();
  world.gravity.set(0,0,-9.82);
  world.allowSleep = true;
  world.solver.iterations = 20;
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.28;
  const floor = new C.Body({mass:0}); floor.addShape(new C.Plane()); world.addBody(floor);
  for(const [x,y,sx,sy] of [[-4.5,0,.15,4.5],[4.5,0,.15,4.5],[0,-4.5,4.5,.15],[0,4.5,4.5,.15]]){
    const wall = new C.Body({mass:0}); wall.addShape(new C.Box(new C.Vec3(sx,sy,2))); wall.position.set(x,y,1); world.addBody(wall);
  }
  const bodies=[];
  for(let i=0;i<3;i++){
    const body=new C.Body({mass:0.012,linearDamping:.22,angularDamping:.18,allowSleep:true,sleepSpeedLimit:.12,sleepTimeLimit:.7});
    body.addShape(new C.Cylinder(.5,.5,.07,24));
    body.position.set((i-1)*1.2,0,2+i*.23);
    const phase=(input.phase||0) + input.duration*3 + input.distance*.013 + round*.71 + i*1.91;
    body.quaternion.setFromEuler(phase,phase*.73,phase*.31);
    body.velocity.set(input.vx*.002+(i-1)*.3,input.vy*.002,2+Math.min(3,input.distance*.008));
    body.angularVelocity.set(9+input.vy*.012+i*2,7+input.vx*.012-i,phase%7);
    world.addBody(body); bodies.push(body);
  }
  return {world,bodies};
}


// Shared physical settlement criteria for visible and background casting.
function advanceCoinWorld(sim){
  sim.world.step(1/120);
  sim.steps=(sim.steps||0)+1;
  const quiet=sim.bodies.every(b=>b.velocity.length()<.035&&b.angularVelocity.length()<.08&&b.position.z<.5);
  sim.stable=quiet?(sim.stable||0)+1:0;
  if(sim.stable>=72){
    const normals=sim.bodies.map(b=>b.quaternion.vmult(new CANNON.Vec3(0,0,1)).z);
    if(normals.every(n=>Math.abs(n)>.97)){
      const coins=normals.map(n=>n>0?'字':'背'),sum=coins.reduce((s,c)=>s+(c==='字'?2:3),0);
      return {line:{...lineFromSum(sum),coins}};
    }
    return {retry:true};
  }
  return sim.steps>=2400?{retry:true}:null;
}


function lineFromSum(sum){
  const yang = (sum === 7 || sum === 9);
  const moving = (sum === 6 || sum === 9);
  return { sum, coins: [], yang, moving };
}

export { createCoinWorld, advanceCoinWorld, lineFromSum };
