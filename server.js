const express=require('express');const path=require('path');const app=express();const PORT=process.env.PORT||3000;
app.use(express.static(__dirname,{extensions:['html']}));
const pages=['/','/index','/terminal','/dashboard','/challenge','/rules','/positions','/payments','/settings'];
pages.forEach(p=>app.get(p,(req,res)=>{let f=p==='/'?'index':p.slice(1);res.sendFile(path.join(__dirname,`${f}.html`));}));
app.get('/health',(req,res)=>res.json({ok:true,app:'Dropz Universal Propfirm Trading'}));
app.listen(PORT,()=>console.log(`Dropz Universal Propfirm Trading running on ${PORT}`));
