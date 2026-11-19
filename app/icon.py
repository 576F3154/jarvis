from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math
S=1024; c=S/2; CY=(62,230,255)
def apple(s):
    m=Image.new('L',(S,S),0); d=ImageDraw.Draw(m)
    cx, oy = c, c+60
    r=235*s
    for dx in (-118,118):
        d.ellipse([cx+dx*s-r,oy-40*s-r,cx+dx*s+r,oy-40*s+r],fill=255)
    d.ellipse([cx-215*s,oy-120*s,cx+215*s,oy+300*s],fill=255)
    for dx in (-95,95):
        d.ellipse([cx+dx*s-120*s,oy+90*s,cx+dx*s+120*s,oy+300*s],fill=255)
    d.ellipse([cx-48*s,oy-40*s-r-40*s,cx+48*s,oy-40*s-r+70*s],fill=0)
    d.ellipse([cx-30*s,oy+280*s,cx+30*s,oy+330*s],fill=0)
    return m.filter(ImageFilter.GaussianBlur(int(34*s))).point(lambda v:255 if v>128 else 0)
o=apple(1); i1=apple(.92); i2=apple(.80); i3=apple(.77)
im=Image.new('RGBA',(S,S),(0,0,0,0))
g=Image.new('RGBA',(S,S),CY+(0,)); g.putalpha(o.filter(ImageFilter.GaussianBlur(40)).point(lambda v:int(v*.75))); im.alpha_composite(g)
im.paste(Image.new('RGBA',(S,S),(6,18,30,255)),(0,0),o)
im.paste(Image.new('RGBA',(S,S),CY+(255,)),(0,0),ImageChops.subtract(o,i1))
im.paste(Image.new('RGBA',(S,S),CY+(150,)),(0,0),ImageChops.subtract(i2,i3))
d=ImageDraw.Draw(im)
top=c+60-40-235
d.line([c,top+75,c+18,top-80],fill=CY+(255,),width=26)
leaf=Image.new('L',(S,S),0); ImageDraw.Draw(leaf).ellipse([c+30,top-150,c+230,top-70],fill=255)
leaf=leaf.rotate(30,center=(c+30,top-110),resample=Image.BICUBIC)
lg=Image.new('RGBA',(S,S),CY+(0,)); lg.putalpha(leaf.filter(ImageFilter.GaussianBlur(25)).point(lambda v:int(v*.6))); im.alpha_composite(lg)
im.paste(Image.new('RGBA',(S,S),CY+(255,)),(0,0),leaf)
oy=c+110
core=Image.new('RGBA',(S,S),(0,0,0,0)); ImageDraw.Draw(core).ellipse([c-170,oy-170,c+170,oy+170],fill=CY+(255,))
im.alpha_composite(core.filter(ImageFilter.GaussianBlur(40)))
d=ImageDraw.Draw(im)
for k in range(8):
    a=math.radians(k*45+22.5); d.line([c+135*math.cos(a),oy+135*math.sin(a),c+185*math.cos(a),oy+185*math.sin(a)],fill=CY+(230,),width=20)
d.ellipse([c-108,oy-108,c+108,oy+108],fill=(150,245,255,255)); d.ellipse([c-56,oy-56,c+56,oy+56],fill=(255,255,255,255))
im=im.crop(im.getbbox()); w,h=im.size; side=max(w,h)+40
sq=Image.new('RGBA',(side,side),(0,0,0,0)); sq.paste(im,((side-w)//2,(side-h)//2)); sq=sq.resize((S,S),Image.LANCZOS)
sq.resize((512,512),Image.LANCZOS).save('build/icon.png')
sq.save('build/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
sq.resize((256,256),Image.LANCZOS).save('../test/icon-preview.png')
