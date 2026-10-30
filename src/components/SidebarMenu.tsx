import React, {useLayoutEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from '../hooks/useDialog';

export function SidebarMenu({anchor,label,onClose,children}:{anchor:HTMLElement;label:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useDialog(true,onClose);
 const [position,setPosition]=useState({left:12,top:12,width:240});
 useLayoutEffect(()=>{
  const update=()=>{
   if(!anchor.isConnected){onClose();return;}
   const rect=anchor.getBoundingClientRect();if(!rect.width||!rect.height){onClose();return;}const width=Math.min(260,window.innerWidth-24);
   const height=Math.min(ref.current?.scrollHeight||300,window.innerHeight-24);
   const collapsed=!!anchor.closest('.is-collapsed');
   const left=Math.max(12,Math.min(collapsed?rect.right+12:rect.left,window.innerWidth-width-12));
   const top=Math.max(12,Math.min(collapsed?rect.top:rect.bottom+6,window.innerHeight-height-12));
   setPosition({left,top,width});
  };
  update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node)&&!anchor.contains(event.target as Node))onClose();};
  document.addEventListener('pointerdown',outside);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);document.removeEventListener('pointerdown',outside);};
 },[anchor]);
 return createPortal(<div ref={ref} role="dialog" aria-label={label} aria-modal="false" tabIndex={-1} className="sn-popover sn-menu-layer" style={{position:'fixed',...position}}>{children}</div>,document.body);
}
