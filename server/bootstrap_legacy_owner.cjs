'use strict';
// Local operator command. Passwords are accepted only through an inherited FD.
const fs=require('node:fs'),path=require('node:path'),tty=require('node:tty');
const {SQLiteAccountStore}=require('./account-sqlite-store'),owner=require('./account-owner-bootstrap');
function readPrivateJSON(file){
 if(!path.isAbsolute(file)||path.basename(file)==='config.js'||path.basename(file)==='.env')throw new Error('Use an explicit private household JSON input');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>256*1024||stat.mode&0o077)throw new Error('Household input must be a private regular file');const data=fs.readFileSync(fd);const after=fs.fstatSync(fd);if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs)throw new Error('Household input changed');const value=JSON.parse(data.toString('utf8'));if(!value||!Array.isArray(value.children))throw new Error('Private household input unavailable');return value.children;}finally{fs.closeSync(fd);}
}
function readPassword(fdText){
 if(!/^(0|[3-9]|[1-9][0-9]{1,3})$/.test(fdText||''))throw new Error('Use an inherited password file descriptor');
 const fd=Number(fdText);if(fd>1024||tty.isatty(fd))throw new Error('Password descriptor must not echo terminal input');
 const stat=fs.fstatSync(fd);if(stat.isFile()&&stat.mode&0o077)throw new Error('Password input must be private');
 const buffer=Buffer.alloc(1025);let length=0;
 try{while(length<buffer.length){const n=fs.readSync(fd,buffer,length,buffer.length-length,null);if(n===0)break;length+=n;}if(length===buffer.length)throw new Error('Password input too long');const raw=buffer.subarray(0,length),text=raw.toString('utf8');if(!Buffer.from(text,'utf8').equals(raw))throw new Error('Invalid password encoding');const value=text.replace(/\r?\n$/,'');if(/[\r\n]/.test(value)||value.length<12||value.length>128)throw new Error('Invalid password input');return value;}finally{buffer.fill(0);}
}
async function main(){
 const [command,...args]=process.argv.slice(2),options={};if(!['status','reserve','provision'].includes(command)||args.length%2)throw new Error('Expected status, reserve or provision and explicit options');
 const allowed=new Set(['--directory','--username','--household-file','--binding-id','--display-name','--password-fd']);
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||Object.hasOwn(options,args[i])||!args[i+1])throw new Error('Invalid operator options');options[args[i]]=args[i+1];}
 const directory=options['--directory'];if(!directory||!path.isAbsolute(directory))throw new Error('Explicit account directory required');
 if(command!=='status'&&process.env.TIMEHUT_PUBLIC_REGISTRATION==='true')throw new Error('Keep public registration disabled during owner initialization');
 if(command==='status'&&!fs.existsSync(path.join(directory,'accounts.sqlite'))){console.log(JSON.stringify({status:'not_initialized'}));return;}
 if(command==='provision'&&!fs.existsSync(path.join(directory,'accounts.sqlite')))throw new Error('Reserve the designated owner before provisioning');
 if(fs.existsSync(directory)){const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.mode&0o077)throw new Error('Private account directory required');}
 const children=command==='reserve'?readPrivateJSON(options['--household-file']||''):null;
 const store=new SQLiteAccountStore(directory);
 try{
  let result;
  if(command==='status')result=owner.status(store);
  if(command==='reserve')result=owner.reserve(store,options['--username'],children);
  if(command==='provision')result=await owner.provision(store,{username:options['--username'],bindingId:options['--binding-id'],displayName:options['--display-name'],password:readPassword(options['--password-fd'])});
  console.log(JSON.stringify(result));
 }finally{store.close();}
}
main().catch(()=>{console.error('Owner initialization not confirmed; existing account data preserved.');process.exitCode=1;});
