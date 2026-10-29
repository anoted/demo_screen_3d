"""Synthetic cameras with known metric geometry; no USB hardware required."""
import unittest
import numpy as np
import cv2 as cv
import screen_calibration as cal

RAW = dict(width=33.5, height=60, pixelWidth=1080, pixelHeight=1920)
CFG = cal.config(RAW)
K = np.array([[1400., 0., 960.], [0., 1400., 540.], [0., 0., 1.]])


def camera(position, target=(0., 0., .1)):
    z=cal.unit(np.array(target)-position)
    x=cal.unit(np.cross(z, [0, 1, 0])); y=np.cross(z, x)
    M=np.eye(4); M[:3,:3]=np.column_stack([x,y,z]); M[:3,3]=position
    return np.linalg.inv(M)


def boards(angle=90, gap=.015, offset=.012):
    a=np.radians(angle/2); w,h=CFG['width'],CFG['height']; g=gap/(2*np.sin(a))
    result={}
    for side, sign in [('left',-1),('right',1)]:
        x=np.array([np.sin(a),0,sign*np.cos(a)])
        origin=np.array([sign*(g+(w if sign<0 else 0))*np.sin(a), h/2+sign*offset/2, (g+(w if sign<0 else 0))*np.cos(a)])
        y=np.array([0.,-1.,0.]); R=np.column_stack([x,y,np.cross(x,y)])
        _,(px,py),_=cal.board_spec(CFG,side)
        M=np.eye(4);M[:3,:3]=R;M[:3,3]=origin+R@np.array([px*w/CFG['pw'],py*h/CFG['ph'],0.])
        result[side]=M
    return result


def observe(side, M, noise=0., seed=1, intrinsic=K):
    n=24 if side in ('shared','monitor') else 32
    ids=np.arange(n); obj=cal.points(CFG,side,ids)
    xy,_=cv.projectPoints(obj,cv.Rodrigues(M[:3,:3])[0],M[:3,3],intrinsic,np.zeros(5))
    xy=xy.reshape(-1,2)+np.random.default_rng(seed).normal(0,noise,(n,2))
    return dict(ids=ids.tolist(),corners=xy.tolist())


def frames(angle=90, gap=.015, offset=.012, noise=.05):
    b=boards(angle,gap,offset); out=[]
    for i in range(12):
        C=camera(np.array([.28*np.sin(i*1.7), .12+.2*np.cos(i), 1.+.08*(i%4)]))
        f={'size':[1920,1080]}
        f.update({s:observe(s,C@M,noise,i) for s,M in b.items()})
        out.append(f)
    return out


class CalibrationTests(unittest.TestCase):
    def test_left_monitor_board_depth_in_display_frame(self):
        B=np.eye(4);B[:3,:3]=np.diag([1.,-1.,-1.]);B[:3,3]=[-.68,.12,-.24]
        captures=frames()
        for i,f in enumerate(captures):
            C=camera(np.array([.28*np.sin(i*1.7), .12+.2*np.cos(i), 1.+.08*(i%4)]))
            f['monitor']=observe('monitor',C@B,.03,i)
        solved=cal.solve(dict(screen=RAW,frames=captures))
        reference=solved['leftMonitor']
        self.assertIsNotNone(reference)
        self.assertEqual(reference['dictionary'],'DICT_4X4_50')
        self.assertEqual(reference['squareMm'],35)
        self.assertEqual(reference['markerMm'],28)
        self.assertEqual(reference['views'],12)
        expected=(B@np.array([.245/2,.175/2,0,1]))[:3]*100
        np.testing.assert_allclose(reference['centerCm'],expected,atol=.6)
        installed=cal.solve_position(dict(screen=RAW,frame=captures[-1],reference=solved['intrinsics']))
        np.testing.assert_allclose(installed['leftMonitor']['centerCm'],expected,atol=.6)
        for i,f in enumerate(captures):
            if i%2:
                C=camera(np.array([.28*np.sin(i*1.7), .12+.2*np.cos(i), 1.+.08*(i%4)]))
                moved=B.copy();moved[2,3]-=.15
                f['monitor']=observe('monitor',C@moved)
        worlds=[]
        for f in captures:
            l,_=cal.pose(CFG,'left',f['left'],K,np.zeros(5));r,_=cal.pose(CFG,'right',f['right'],K,np.zeros(5))
            _,world=cal.screen_frame(CFG,l,r);worlds.append(world)
        self.assertIsNone(cal.monitor_reference(CFG,captures,worlds,K,np.zeros(5)))

    def test_separate_left_monitor_capture_reuses_installed_camera(self):
        C=camera(np.array([.035,.15,1.2]));b=boards()
        frame={'size':[1920,1080],**{s:observe(s,C@M) for s,M in b.items()}}
        lens=dict(matrix=K.tolist(),distortion=np.zeros(5).tolist(),size=[1920,1080])
        installed=cal.solve_position(dict(screen=RAW,frame=frame,reference=lens))
        B=np.eye(4);B[:3,:3]=np.diag([1.,-1.,-1.]);B[:3,3]=[-.68,.12,-.24]
        board=cal.board_spec(CFG,'monitor')[0].generateImage((700,500))
        obj=np.array([[0,0,0],[.245,0,0],[.245,.175,0],[0,.175,0]],np.float32)
        N=C@B;dest,_=cv.projectPoints(obj,cv.Rodrigues(N[:3,:3])[0],N[:3,3],K,np.zeros(5))
        H=cv.getPerspectiveTransform(np.array([[0,0],[700,0],[700,500],[0,500]],np.float32),dest.reshape(4,2))
        image=cv.warpPerspective(board,H,(1920,1080),borderValue=200)
        ok,encoded=cv.imencode('.png',image);self.assertTrue(ok)
        image_data=cal.base64.b64encode(encoded).decode()
        measured=cal.measure_monitor(dict(screen=RAW,image=image_data,reference=installed))['leftMonitor']
        expected=(B@np.array([.245/2,.175/2,0,1]))[:3]*100
        np.testing.assert_allclose(measured['centerCm'],expected,atol=1.2)
        with self.assertRaises(ValueError):
            cal.measure_monitor(dict(screen=RAW,image=image_data,reference={**installed,'installedPosition':False}))
        wrong_size={**installed,'intrinsics':{**lens,'size':[1280,720]}}
        with self.assertRaises(ValueError):cal.measure_monitor(dict(screen=RAW,image=image_data,reference=wrong_size))

    def test_metric_screen_geometry_and_intrinsics(self):
        for angle in [60,90,120,150]:
            solved=cal.solve(dict(screen=RAW,frames=frames(angle)))
            self.assertAlmostEqual(solved['screen']['angle'],angle,delta=.3)
            self.assertAlmostEqual(solved['screen']['gap'],1.5,delta=.15)
            self.assertAlmostEqual(solved['screen']['vOffset'],1.2,delta=.15)
            self.assertAlmostEqual(solved['intrinsics']['matrix'][0][0],1400,delta=30)
            expected=np.array([.28*np.sin(11*1.7),.12+.2*np.cos(11),1.+.08*3])
            actual=np.asarray(solved['calibrationCamera']['matrix'])[:3,3]
            np.testing.assert_allclose(actual,expected,atol=.01)

    def test_pattern_detection_and_distinct_ids(self):
        for side in ['left','right','shared']:
            pattern=cal.pattern(RAW,side)
            image=cal.decode(pattern['image'])
            detection=cal.detect_one(image,CFG,side)
            self.assertGreaterEqual(len(detection['ids']),20)
        left=cal.board_spec(CFG,'left')[0].getIds()
        right=cal.board_spec(CFG,'right')[0].getIds()
        self.assertFalse(set(left)&set(right))
        self.assertGreaterEqual(min(left),100)

    def test_installed_position_reuses_lens(self):
        reference=cal.solve(dict(screen=RAW,frames=frames()))['intrinsics']
        C=camera(np.array([.035,.15,1.2])); b=boards()
        frame={'size':[1920,1080], **{s:observe(s,C@M,.03) for s,M in b.items()}}
        solved=cal.solve_position(dict(screen=RAW,frame=frame,reference=reference))
        self.assertTrue(solved['installedPosition'])
        self.assertAlmostEqual(solved['screen']['angle'],90,delta=.3)
        np.testing.assert_allclose(np.asarray(solved['calibrationCamera']['matrix'])[:3,3],[.035,.15,1.2],atol=.01)
        bad=dict(frame,size=[1280,720])
        with self.assertRaises(ValueError):cal.solve_position(dict(screen=RAW,frame=bad,reference=reference))

    def test_projected_pattern_detection(self):
        b=boards(); C=camera(np.array([.03,.15,1.2])); image=np.full((1080,1920),180,np.uint8)
        for side,M in b.items():
            pattern=cal.decode(cal.pattern(RAW,side)['image'])
            _,(px,py),_=cal.board_spec(CFG,side)
            origin=M.copy();origin[:3,3]-=M[:3,:3]@np.array([px*CFG['width']/CFG['pw'],py*CFG['height']/CFG['ph'],0])
            obj=np.array([[0,0,0],[CFG['width'],0,0],[CFG['width'],CFG['height'],0],[0,CFG['height'],0]],np.float32)
            N=C@origin; dest,_=cv.projectPoints(obj,cv.Rodrigues(N[:3,:3])[0],N[:3,3],K,np.zeros(5))
            src=np.array([[0,0],[1080,0],[1080,1920],[0,1920]],np.float32)
            H=cv.getPerspectiveTransform(src,dest.reshape(4,2))
            warp=cv.warpPerspective(pattern,H,(1920,1080),borderValue=180)
            mask=cv.warpPerspective(np.full_like(pattern,255),H,(1920,1080))
            image[mask>200]=warp[mask>200]
        # The physical rig has an older printed ID 16 beside the displays.
        # Screen IDs must not collide with it during ChArUco interpolation.
        old=cv.aruco.generateImageMarker(cal.DICTIONARY,16,90)
        image[160:270,120:230]=cv.copyMakeBorder(old,10,10,10,10,cv.BORDER_CONSTANT,value=255)
        for side in b:
            det=cal.detect_one(image,CFG,side)
            expected=observe(side,C@b[side]); lookup=dict(zip(expected['ids'],expected['corners']))
            error=np.mean([np.linalg.norm(np.array(xy)-lookup[i]) for i,xy in zip(det['ids'],det['corners'])])
            self.assertLess(error,1.)

        # An identical wall board must not replace the physical left monitor's
        # reference. The monitor print is rotated, as on the actual rig.
        image[160:270,120:230]=180
        physical=cal.board_spec(CFG,'monitor')[0].generateImage((350,250))
        physical=cv.copyMakeBorder(physical,15,15,15,15,cv.BORDER_CONSTANT,value=255)
        rotated=cv.rotate(physical,cv.ROTATE_90_CLOCKWISE)
        image[360:740,150:430]=rotated
        image[25:305,1300:1680]=physical
        ok,encoded=cv.imencode('.png',image);self.assertTrue(ok)
        detection=cal.detect(dict(screen=RAW,image='data:image/png;base64,'+cal.base64.b64encode(encoded).decode()))
        self.assertEqual(len(detection['monitor']['ids']),24)
        self.assertLess(max(p[0] for p in detection['monitor']['corners']),430)

    def test_shared_tracking_camera_chain(self):
        reference=cal.solve(dict(screen=RAW,frames=frames()))['intrinsics']
        C=camera(np.array([.15,.2,1.4])); b=boards()
        # Tracking camera faces +z and slightly down from the top of the seam.
        p=np.array([.012,.34,.03]); T=camera(p,p+np.array([.08,-.35,1.]))
        captures=[]
        for i in range(12):
            B=np.eye(4); B[:3,:3]=cv.Rodrigues(np.array([.2*np.sin(i),.4*np.cos(i),.08*np.sin(i*2)]))[0]
            B[:3,3]=[-.08+.04*np.sin(i),.04+.08*np.cos(i),.68+.05*(i%3)]
            f={'size':[1920,1080],'trackingSize':[1920,1080]}
            f.update({s:observe(s,C@M,.02,i) for s,M in b.items()})
            f['shared']=observe('shared',C@B,.02,i);f['tracking']=observe('shared',T@B,.02,i)
            captures.append(f)
        solved=cal.solve_tracking(dict(screen=RAW,frames=captures,reference=reference))['trackingCamera']
        self.assertAlmostEqual(solved['x'],1.2,delta=.5)
        self.assertAlmostEqual(solved['forward'],3,delta=.5)
        self.assertAlmostEqual(solved['top'],3.4,delta=.5)
        self.assertAlmostEqual(solved['yaw'],np.degrees(np.arctan2(.08,1)),delta=1)

    def test_rejections(self):
        with self.assertRaises(ValueError):cal.config(dict(RAW,pixelWidth=1920,pixelHeight=1080))
        with self.assertRaises(ValueError):cal.solve(dict(screen=RAW,frames=frames()[:2]))
        with self.assertRaises(ValueError):cal.solve(dict(screen=RAW,frames=[frames()[0]]*8))
        bad=frames();bad[3]['size']=[1280,720]
        with self.assertRaises(ValueError):cal.solve(dict(screen=RAW,frames=bad))
        bad=frames();bad[0]['left']['ids'][0]=999
        with self.assertRaises(ValueError):cal.solve(dict(screen=RAW,frames=bad))
        b=boards();b['right'][:3,3]+=np.array([0,0,.05])
        with self.assertRaises(ValueError):cal.screen_frame(CFG,b['left'],b['right'])

if __name__=='__main__':unittest.main()
